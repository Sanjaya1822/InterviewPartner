"""
Analytics and dashboard endpoints.
Redis caching is used for the dashboard (5-minute TTL) to reduce DB load.
"""
import json
import logging
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.dependencies import get_current_user
from app.db.base import get_db
from app.db.models import InterviewSession, Answer, Question, User

router = APIRouter(prefix="/analytics", tags=["Analytics"])
logger = logging.getLogger(__name__)

# ─── Redis cache helpers ──────────────────────────────────────────────────────

_redis_client = None

async def _get_redis():
    """Get Redis client, returns None if unavailable (graceful degradation)."""
    global _redis_client
    if _redis_client is not None:
        return _redis_client
    try:
        import redis.asyncio as aioredis
        client = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
        await client.ping()
        _redis_client = client
        return client
    except Exception:
        return None  # Redis unavailable — operate without cache


async def _cache_get(key: str) -> Optional[dict]:
    """Get value from Redis cache. Returns None on miss or error."""
    try:
        r = await _get_redis()
        if r is None:
            return None
        raw = await r.get(key)
        return json.loads(raw) if raw else None
    except Exception:
        return None


async def _cache_set(key: str, value: dict, ttl_seconds: int = 300) -> None:
    """Set value in Redis cache. Silently fails if Redis is unavailable."""
    try:
        r = await _get_redis()
        if r is None:
            return
        await r.setex(key, ttl_seconds, json.dumps(value, default=str))
    except Exception:
        pass


async def _cache_delete(pattern: str) -> None:
    """Delete keys matching a pattern. Used for cache invalidation."""
    try:
        r = await _get_redis()
        if r is None:
            return
        keys = await r.keys(pattern)
        if keys:
            await r.delete(*keys)
    except Exception:
        pass


DASHBOARD_CACHE_TTL = 300  # 5 minutes


@router.get("/dashboard")
async def get_dashboard(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Get comprehensive dashboard statistics.
    Results are cached per-user for 5 minutes in Redis.
    """
    user_id = str(current_user.id)
    cache_key = f"dashboard:{user_id}"

    # ── Try cache first ───────────────────────────────────────────────────────
    cached = await _cache_get(cache_key)
    if cached is not None:
        logger.debug("Dashboard cache HIT for user %s", user_id)
        return cached

    logger.debug("Dashboard cache MISS for user %s — querying DB", user_id)

    # Total sessions
    total_result = await db.execute(
        select(func.count(InterviewSession.id))
        .where(InterviewSession.user_id == user_id)
    )
    total_sessions = total_result.scalar() or 0

    # Completed sessions
    completed_result = await db.execute(
        select(func.count(InterviewSession.id))
        .where(
            InterviewSession.user_id == user_id,
            InterviewSession.status == "completed",
        )
    )
    completed_sessions = completed_result.scalar() or 0

    # Average score
    avg_result = await db.execute(
        select(func.avg(InterviewSession.overall_score))
        .where(
            InterviewSession.user_id == user_id,
            InterviewSession.status == "completed",
            InterviewSession.overall_score.isnot(None),
        )
    )
    average_score = float(avg_result.scalar() or 0)

    # Best score
    best_result = await db.execute(
        select(func.max(InterviewSession.overall_score))
        .where(
            InterviewSession.user_id == user_id,
            InterviewSession.status == "completed",
        )
    )
    best_score = float(best_result.scalar() or 0)

    # Total practice minutes
    minutes_result = await db.execute(
        select(func.sum(InterviewSession.duration_seconds))
        .where(
            InterviewSession.user_id == user_id,
            InterviewSession.status == "completed",
        )
    )
    total_seconds = minutes_result.scalar() or 0
    total_practice_minutes = int(total_seconds / 60)

    # Score trend (last 30 days)
    thirty_days_ago = datetime.now(timezone.utc) - timedelta(days=30)
    trend_result = await db.execute(
        select(
            InterviewSession.id,
            InterviewSession.overall_score,
            InterviewSession.started_at,
        )
        .where(
            InterviewSession.user_id == user_id,
            InterviewSession.status == "completed",
            InterviewSession.overall_score.isnot(None),
            InterviewSession.started_at >= thirty_days_ago,
        )
        .order_by(InterviewSession.started_at)
    )
    trend_sessions = trend_result.all()
    score_trend = [
        {
            "date": row.started_at.strftime("%Y-%m-%d") if row.started_at else "",
            "score": float(row.overall_score),
            "session_id": str(row.id),
        }
        for row in trend_sessions
        if row.overall_score is not None
    ]

    # Skill breakdown from completed sessions
    skill_result = await db.execute(
        select(
            func.avg(InterviewSession.technical_score).label("technical"),
            func.avg(InterviewSession.communication_score).label("communication"),
            func.avg(InterviewSession.confidence_score).label("confidence"),
            func.avg(InterviewSession.problem_solving_score).label("problem_solving"),
            func.avg(InterviewSession.code_quality_score).label("code_quality"),
            func.avg(InterviewSession.grammar_score).label("grammar"),
        )
        .where(
            InterviewSession.user_id == user_id,
            InterviewSession.status == "completed",
        )
    )
    skill_row = skill_result.one_or_none()

    def _to_skill(name: str, score, label: str = None) -> dict:
        s = float(score or 0)
        return {
            "skill": label or name.replace("_", " ").title(),
            "score": round(s, 1),
            "max_score": 100.0,
            "level": _score_to_level(s),
        }

    skill_breakdown = []
    if skill_row:
        skill_breakdown = [
            _to_skill("technical", skill_row.technical, "Technical Knowledge"),
            _to_skill("communication", skill_row.communication, "Communication"),
            _to_skill("confidence", skill_row.confidence, "Confidence"),
            _to_skill("problem_solving", skill_row.problem_solving, "Problem Solving"),
            _to_skill("code_quality", skill_row.code_quality, "Code Quality"),
            _to_skill("grammar", skill_row.grammar, "Grammar & Clarity"),
        ]

    # Topic performance from question categories
    q_result = await db.execute(
        select(
            Question.category,
            func.count(Question.id).label("count"),
            func.avg(Answer.score).label("avg_score"),
        )
        .join(Answer, Answer.question_id == Question.id, isouter=True)
        .join(InterviewSession, InterviewSession.id == Question.session_id)
        .where(InterviewSession.user_id == user_id)
        .group_by(Question.category)
        .having(func.count(Question.id) >= 1)
        .order_by(func.avg(Answer.score).asc())
    )
    topic_rows = q_result.all()
    topic_performance = [
        {
            "topic": row.category or "General",
            "sessions_count": row.count,
            "average_score": round(float(row.avg_score or 0), 1),
            "trend": "improving",  # Would need historical data for real trend
        }
        for row in topic_rows
    ]

    # Recent sessions
    recent_result = await db.execute(
        select(InterviewSession)
        .where(InterviewSession.user_id == user_id)
        .order_by(InterviewSession.started_at.desc())
        .limit(5)
    )
    recent_sessions = [
        {
            "id": str(s.id),
            "job_role": s.job_role,
            "interview_type": s.interview_type,
            "difficulty": s.difficulty,
            "status": s.status,
            "overall_score": s.overall_score,
            "started_at": s.started_at.isoformat() if s.started_at else "",
            "duration_seconds": s.duration_seconds,
        }
        for s in recent_result.scalars().all()
    ]

    # Weekly goal
    week_start = datetime.now(timezone.utc) - timedelta(days=datetime.now().weekday())
    weekly_result = await db.execute(
        select(func.count(InterviewSession.id))
        .where(
            InterviewSession.user_id == user_id,
            InterviewSession.status == "completed",
            InterviewSession.started_at >= week_start,
        )
    )
    weekly_completed = weekly_result.scalar() or 0

    # Streak calculation
    current_streak = await _calculate_streak(db, user_id)

    result = {
        "total_sessions": total_sessions,
        "completed_sessions": completed_sessions,
        "average_score": round(average_score, 1),
        "total_practice_minutes": total_practice_minutes,
        "best_score": round(best_score, 1),
        "current_streak_days": current_streak,
        "score_trend": score_trend,
        "skill_breakdown": skill_breakdown,
        "topic_performance": topic_performance,
        "recent_sessions": recent_sessions,
        "weekly_goal": 3,
        "weekly_completed": weekly_completed,
    }

    # ── Store in cache ────────────────────────────────────────────────────────
    await _cache_set(cache_key, result, ttl_seconds=DASHBOARD_CACHE_TTL)
    return result


@router.get("/sessions/{session_id}/report")
async def get_session_report(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get the detailed report for a completed session. Auto-generates if missing."""
    from app.db.models import Report, Answer, Question

    result = await db.execute(
        select(InterviewSession).where(
            InterviewSession.id == session_id,
            InterviewSession.user_id == str(current_user.id),
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")

    report_result = await db.execute(
        select(Report).where(Report.session_id == session_id)
    )
    report = report_result.scalar_one_or_none()

    # ── Auto-generate report if missing ──────────────────────────────────────
    if not report:
        logger.info("Report missing for session %s — auto-generating", session_id)

        # Fetch answers for Q&A data
        ans_result = await db.execute(
            select(Answer).where(Answer.session_id == session_id)
        )
        answers = ans_result.scalars().all()

        q_result = await db.execute(
            select(Question).where(Question.session_id == session_id)
                .order_by(Question.question_number)
        )
        questions = q_result.scalars().all()

        # Build Q&A pairs for report prompt
        qa_list = []
        for q in questions:
            ans = next((a for a in answers if a.question_id == str(q.id)), None)
            qa_list.append({
                "question": q.question_text,
                "answer": ans.answer_text if ans else "[No answer]",
                "score": ans.score if ans else 0,
            })

        overall = session.overall_score or 0.0

        # Compute score breakdown from answers
        scored = [a for a in answers if a.score is not None]

        def _avg_field(field: str) -> float:
            vals = [getattr(a, field) for a in scored if getattr(a, field) is not None]
            return round(sum(vals) / len(vals), 1) if vals else round(overall, 1)

        sb = {
            "overall":       round(overall, 1),
            "technical":     _avg_field("technical_score"),
            "communication": _avg_field("communication_score"),
            "confidence":    _avg_field("confidence_score"),
            "grammar":       _avg_field("score"),
            "problem_solving": _avg_field("technical_score"),
            "questions_count": len(questions),
        }

        # Update session dimension scores if missing
        if not session.technical_score and scored:
            session.technical_score     = sb["technical"] or None
            session.communication_score = sb["communication"] or None
            session.confidence_score    = sb["confidence"] or None
            session.grammar_score       = sb["grammar"] or None
            session.problem_solving_score = sb["problem_solving"] or None

        # Use LLM to generate summary, strengths, weaknesses, roadmap
        report_data: dict = {}
        try:
            from app.services.ai.agents import report_agent, recommendation_agent
            from app.services.ai.prompts import get_report_generation_prompt
            from app.services.ai.llm_provider import invoke_with_fallback
            from langchain_core.messages import SystemMessage, HumanMessage
            import json, re

            prompt = get_report_generation_prompt(
                job_role=session.job_role,
                experience_level=session.experience_level,
                interview_type=session.interview_type,
                questions_and_answers=qa_list[:10],  # cap to save tokens
                score_breakdown=sb,
                overall_score=overall,
            )
            response = await invoke_with_fallback([
                SystemMessage(content="You are an expert interview performance analyst. Return only valid JSON."),
                HumanMessage(content=prompt),
            ])
            try:
                text = response.strip()
                match = re.search(r"\{.*\}", text, re.DOTALL)
                if match:
                    report_data = json.loads(match.group(0))
            except Exception:
                pass
        except Exception as e:
            logger.warning("Report LLM generation failed (non-fatal): %s", e)

        # Fallback report if LLM failed
        if not report_data:
            report_data = {
                "executive_summary": f"The candidate completed a {session.interview_type} interview for {session.job_role} with an overall score of {overall:.0f}/100.",
                "hiring_recommendation": session.hiring_recommendation or "maybe",
                "interview_readiness": "needs_work" if overall < 60 else "almost_ready" if overall < 75 else "ready",
                "strengths": ["Completed the interview session"],
                "weaknesses": ["More practice recommended"],
                "improvement_areas": ["Review fundamentals", "Practice mock interviews"],
                "recommended_topics": [session.job_role, "Communication", "Problem Solving"],
                "learning_roadmap": [
                    {"week": 1, "focus": "Core Fundamentals", "resources": ["LeetCode Easy", "YouTube tutorials"], "goals": ["Review basics", "Practice 5 problems"]},
                    {"week": 2, "focus": "Communication Skills", "resources": ["Mock interviews", "STAR method guide"], "goals": ["Improve answer structure", "Practice 3 mock interviews"]},
                    {"week": 3, "focus": session.job_role + " Deep Dive", "resources": ["Official docs", "System design primer"], "goals": ["Master key concepts", "Build a project"]},
                    {"week": 4, "focus": "Interview Simulation", "resources": ["InterviewAI full sessions", "Peer practice"], "goals": ["Complete 5 full mock interviews", "Review all feedback"]},
                ],
            }

        # Create and save the report
        report = Report(
            session_id=str(session.id),
            user_id=str(current_user.id),
            executive_summary=report_data.get("executive_summary", ""),
            strengths=report_data.get("strengths", []),
            weaknesses=report_data.get("weaknesses", []),
            improvement_areas=report_data.get("improvement_areas", []),
            recommended_topics=report_data.get("recommended_topics", []),
            learning_roadmap=report_data.get("learning_roadmap", []),
            interview_readiness=report_data.get("interview_readiness", "needs_work"),
            score_breakdown=sb,
            status="ready",
        )
        db.add(report)
        await db.flush()
        logger.info("Auto-generated report for session %s", session_id)

    return {
        "session_id": session_id,
        "job_role": session.job_role,
        "interview_type": session.interview_type,
        "overall_score": session.overall_score,
        "hiring_recommendation": session.hiring_recommendation,
        "executive_summary": report.executive_summary,
        "strengths": report.strengths,
        "weaknesses": report.weaknesses,
        "improvement_areas": report.improvement_areas,
        "recommended_topics": report.recommended_topics,
        "learning_roadmap": report.learning_roadmap,
        "score_breakdown": report.score_breakdown,
        "interview_readiness": report.interview_readiness,
        "confidence_assessment": None,
        "communication_assessment": None,
        "technical_assessment": None,
        "pdf_url": f"/api/v1/analytics/reports/{report.id}/pdf" if report.pdf_path else None,
        "created_at": report.created_at.isoformat() if report.created_at else "",
    }


@router.post("/reports/{report_id}/pdf")
async def generate_pdf(
    report_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Generate PDF report for a session."""
    from app.db.models import Report
    from pathlib import Path
    import uuid

    report_result = await db.execute(
        select(Report).where(
            Report.id == report_id,
            Report.user_id == str(current_user.id),
        )
    )
    report = report_result.scalar_one_or_none()
    if not report:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Report not found")

    session_result = await db.execute(
        select(InterviewSession).where(InterviewSession.id == report.session_id)
    )
    session = session_result.scalar_one_or_none()

    pdf_dir = Path("reports") / str(current_user.id)
    pdf_dir.mkdir(parents=True, exist_ok=True)
    pdf_path = str(pdf_dir / f"report_{report_id}.pdf")

    from app.services.report_service import generate_pdf_report
    try:
        generate_pdf_report(session, report, pdf_path)
        report.pdf_path = pdf_path
        report.pdf_generated_at = datetime.now(timezone.utc)
        await db.flush()
        return {
            "pdf_url": f"/api/v1/analytics/reports/{report_id}/pdf/download",
            "generated_at": report.pdf_generated_at.isoformat(),
        }
    except Exception as e:
        logger.error("PDF generation failed: %s", e)
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, f"PDF generation failed: {e}")


@router.get("/reports/{report_id}/pdf/download")
async def download_pdf(
    report_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Download the PDF report."""
    from fastapi.responses import FileResponse
    from app.db.models import Report

    report_result = await db.execute(
        select(Report).where(
            Report.id == report_id,
            Report.user_id == str(current_user.id),
        )
    )
    report = report_result.scalar_one_or_none()
    if not report or not report.pdf_path:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "PDF not found")

    return FileResponse(
        report.pdf_path,
        media_type="application/pdf",
        filename=f"interview_report_{report_id}.pdf",
    )


# ─────────────────────────────────────────────────────────────────────────────

def _score_to_level(score: float) -> str:
    if score >= 80:
        return "strong"
    elif score >= 65:
        return "good"
    elif score >= 45:
        return "average"
    return "weak"


async def _calculate_streak(db: AsyncSession, user_id: str) -> int:
    """Calculate consecutive days with at least one completed session."""
    result = await db.execute(
        select(func.date(InterviewSession.started_at).label("day"))
        .where(
            InterviewSession.user_id == user_id,
            InterviewSession.status == "completed",
        )
        .group_by(func.date(InterviewSession.started_at))
        .order_by(func.date(InterviewSession.started_at).desc())
        .limit(30)
    )
    days = [row.day for row in result.all()]
    if not days:
        return 0

    streak = 0
    today = datetime.now(timezone.utc).date()
    for i, day in enumerate(days):
        expected = today - timedelta(days=i)
        if hasattr(day, "date"):
            day = day.date()
        if day == expected:
            streak += 1
        else:
            break
    return streak
