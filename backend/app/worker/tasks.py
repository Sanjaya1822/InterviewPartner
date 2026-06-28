"""
Celery background tasks.
"""
import logging
from datetime import datetime, timezone
from pathlib import Path

from app.worker.celery_app import celery_app
from app.core.config import settings

logger = logging.getLogger(__name__)


@celery_app.task(bind=True, max_retries=3, default_retry_delay=10)
def generate_pdf_report_task(self, session_id: str, user_id: str):
    """Background task to generate PDF report for a completed session."""
    from sqlalchemy.orm import Session
    from sqlalchemy import create_engine, select
    from app.db.models import InterviewSession, Report

    engine = create_engine(
        settings.DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://"),
        pool_pre_ping=True,
    )

    try:
        with engine.connect() as conn:
            session_row = conn.execute(
                select(InterviewSession).where(InterviewSession.id == session_id)
            ).fetchone()
            report_row = conn.execute(
                select(Report).where(Report.session_id == session_id)
            ).fetchone()

            if not session_row or not report_row:
                logger.error("Session or report not found: %s", session_id)
                return

        # Use sync ORM
        from sqlalchemy.orm import sessionmaker
        SyncSession = sessionmaker(bind=engine)
        with SyncSession() as db:
            session = db.get(InterviewSession, session_id)
            report = db.query(Report).filter(Report.session_id == session_id).first()

            if not session or not report:
                return

            report.status = "generating"
            db.commit()

            pdf_dir = Path(settings.REPORTS_DIR) / user_id
            pdf_dir.mkdir(parents=True, exist_ok=True)
            pdf_path = str(pdf_dir / f"report_{report.id}.pdf")

            from app.services.report_service import generate_pdf_report
            generate_pdf_report(session, report, pdf_path)

            report.pdf_path = pdf_path
            report.pdf_generated_at = datetime.now(timezone.utc)
            report.status = "ready"
            db.commit()

            logger.info("PDF report generated for session %s", session_id)

    except Exception as exc:
        logger.error("PDF generation failed for session %s: %s", session_id, exc)
        raise self.retry(exc=exc)
