"""
PDF report generation service using ReportLab.
"""
import logging
from datetime import datetime
from pathlib import Path
from typing import Optional

from app.core.config import settings
from app.db.models import InterviewSession, Report

logger = logging.getLogger(__name__)


def generate_pdf_report(
    session: InterviewSession,
    report: Report,
    output_path: str,
) -> str:
    """
    Generate a comprehensive PDF interview report.
    Returns the path to the generated PDF.
    """
    try:
        from reportlab.lib import colors
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.units import cm
        from reportlab.platypus import (
            SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
            HRFlowable, PageBreak,
        )
        from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_JUSTIFY

        Path(output_path).parent.mkdir(parents=True, exist_ok=True)
        doc = SimpleDocTemplate(
            output_path,
            pagesize=A4,
            rightMargin=2 * cm,
            leftMargin=2 * cm,
            topMargin=2 * cm,
            bottomMargin=2 * cm,
        )

        styles = getSampleStyleSheet()
        story = []

        # ── Custom styles ────────────────────────────────────────────────
        title_style = ParagraphStyle(
            "CustomTitle",
            parent=styles["Heading1"],
            fontSize=24,
            textColor=colors.HexColor("#4f46e5"),
            spaceAfter=6,
            alignment=TA_CENTER,
        )
        subtitle_style = ParagraphStyle(
            "Subtitle",
            parent=styles["Normal"],
            fontSize=12,
            textColor=colors.HexColor("#6b7280"),
            alignment=TA_CENTER,
            spaceAfter=12,
        )
        section_header_style = ParagraphStyle(
            "SectionHeader",
            parent=styles["Heading2"],
            fontSize=14,
            textColor=colors.HexColor("#1e1b4b"),
            spaceBefore=16,
            spaceAfter=8,
            borderPad=4,
        )
        body_style = ParagraphStyle(
            "Body",
            parent=styles["Normal"],
            fontSize=10,
            spaceAfter=6,
            alignment=TA_JUSTIFY,
        )
        bullet_style = ParagraphStyle(
            "Bullet",
            parent=styles["Normal"],
            fontSize=10,
            leftIndent=16,
            spaceAfter=4,
            bulletIndent=8,
        )

        # ── Header ───────────────────────────────────────────────────────
        story.append(Paragraph("AI Interview Practice Partner", title_style))
        story.append(Paragraph("Interview Performance Report", subtitle_style))
        story.append(HRFlowable(width="100%", thickness=2, color=colors.HexColor("#4f46e5")))
        story.append(Spacer(1, 12))

        # ── Session Info ─────────────────────────────────────────────────
        info_data = [
            ["Job Role", session.job_role, "Interview Type", session.interview_type.title()],
            ["Experience", session.experience_level.title(), "Difficulty", session.difficulty.title()],
            ["Duration", f"{session.duration_minutes} min", "Date", _format_date(session.started_at)],
        ]
        if session.company_name:
            info_data.append(["Company", session.company_name, "", ""])

        info_table = Table(info_data, colWidths=[3.5 * cm, 6 * cm, 3.5 * cm, 6 * cm])
        info_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f8fafc")),
            ("TEXTCOLOR", (0, 0), (0, -1), colors.HexColor("#4f46e5")),
            ("TEXTCOLOR", (2, 0), (2, -1), colors.HexColor("#4f46e5")),
            ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
            ("FONTNAME", (2, 0), (2, -1), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 9),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
            ("PADDING", (0, 0), (-1, -1), 6),
        ]))
        story.append(info_table)
        story.append(Spacer(1, 16))

        # ── Overall Score ─────────────────────────────────────────────────
        overall = session.overall_score or 0
        rec = session.hiring_recommendation or "N/A"
        score_color = _score_to_color(overall)

        score_data = [
            [
                Paragraph(f'<font size="36" color="{score_color}"><b>{overall:.1f}</b></font>', styles["Normal"]),
                Paragraph(f'<font size="10" color="#6b7280">OUT OF 100</font><br/>'
                          f'<font size="14" color="{score_color}"><b>{_score_to_label(overall)}</b></font>', styles["Normal"]),
                Paragraph(f'<font size="10" color="#6b7280">RECOMMENDATION</font><br/>'
                          f'<font size="12" color="{_rec_to_color(rec)}"><b>{rec.replace("_", " ").upper()}</b></font>', styles["Normal"]),
            ]
        ]
        score_table = Table(score_data, colWidths=[5 * cm, 7 * cm, 7 * cm])
        score_table.setStyle(TableStyle([
            ("ALIGN", (0, 0), (-1, -1), "CENTER"),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f0f4ff")),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
            ("PADDING", (0, 0), (-1, -1), 12),
            ("ROUNDEDCORNERS", [4, 4, 4, 4]),
        ]))
        story.append(score_table)
        story.append(Spacer(1, 20))

        # ── Score Breakdown ───────────────────────────────────────────────
        story.append(Paragraph("Score Breakdown", section_header_style))
        score_items = [
            ("Technical Knowledge", session.technical_score),
            ("Communication Quality", session.communication_score),
            ("Confidence Level", session.confidence_score),
            ("Problem Solving", session.problem_solving_score),
            ("Code Quality", session.code_quality_score),
            ("Grammar & Clarity", session.grammar_score),
        ]
        breakdown_data = [["Dimension", "Score", "Rating"]]
        for name, score_val in score_items:
            if score_val is not None:
                breakdown_data.append([
                    name,
                    f"{score_val:.1f}/100",
                    _score_to_label(score_val),
                ])
        if len(breakdown_data) > 1:
            breakdown_table = Table(breakdown_data, colWidths=[8 * cm, 4 * cm, 5 * cm])
            breakdown_table.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#4f46e5")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 10),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
                ("PADDING", (0, 0), (-1, -1), 7),
            ]))
            story.append(breakdown_table)
            story.append(Spacer(1, 16))

        # ── Executive Summary ──────────────────────────────────────────────
        if report.executive_summary:
            story.append(Paragraph("Executive Summary", section_header_style))
            story.append(Paragraph(report.executive_summary, body_style))
            story.append(Spacer(1, 12))

        # ── Strengths ─────────────────────────────────────────────────────
        if report.strengths:
            story.append(Paragraph("Key Strengths", section_header_style))
            for item in report.strengths:
                story.append(Paragraph(f"✓ {item}", bullet_style))
            story.append(Spacer(1, 12))

        # ── Areas for Improvement ──────────────────────────────────────────
        if report.weaknesses:
            story.append(Paragraph("Areas for Improvement", section_header_style))
            for item in report.weaknesses:
                story.append(Paragraph(f"• {item}", bullet_style))
            story.append(Spacer(1, 12))

        # ── Recommended Topics ─────────────────────────────────────────────
        if report.recommended_topics:
            story.append(Paragraph("Recommended Study Topics", section_header_style))
            for item in report.recommended_topics:
                story.append(Paragraph(f"📚 {item}", bullet_style))
            story.append(Spacer(1, 12))

        # ── Learning Roadmap ───────────────────────────────────────────────
        if report.learning_roadmap:
            story.append(PageBreak())
            story.append(Paragraph("Personalized Learning Roadmap", section_header_style))
            roadmap = report.learning_roadmap
            if isinstance(roadmap, list):
                for week_data in roadmap:
                    if isinstance(week_data, dict):
                        week_num = week_data.get("week", "")
                        focus = week_data.get("focus", "")
                        story.append(Paragraph(f"<b>Week {week_num}: {focus}</b>", body_style))
                        for goal in week_data.get("goals", []):
                            story.append(Paragraph(f"  → {goal}", bullet_style))
                        for res in week_data.get("resources", []):
                            story.append(Paragraph(f"  📖 {res}", bullet_style))
                        story.append(Spacer(1, 8))

        # ── Footer ──────────────────────────────────────────────────────────
        story.append(Spacer(1, 20))
        story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#e2e8f0")))
        story.append(Paragraph(
            f"Generated by AI Interview Practice Partner • {_format_date(datetime.now())}",
            ParagraphStyle("Footer", parent=styles["Normal"], fontSize=8,
                           textColor=colors.HexColor("#9ca3af"), alignment=TA_CENTER),
        ))

        doc.build(story)
        logger.info("PDF report generated: %s", output_path)
        return output_path

    except Exception as e:
        logger.error("PDF generation failed: %s", e)
        raise


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _format_date(dt) -> str:
    if not dt:
        return "N/A"
    if hasattr(dt, "strftime"):
        return dt.strftime("%B %d, %Y")
    return str(dt)[:10]


def _score_to_label(score: float) -> str:
    if score >= 85:
        return "Excellent"
    elif score >= 70:
        return "Good"
    elif score >= 55:
        return "Average"
    elif score >= 40:
        return "Below Average"
    return "Needs Work"


def _score_to_color(score: float) -> str:
    if score >= 80:
        return "#22c55e"
    elif score >= 65:
        return "#84cc16"
    elif score >= 50:
        return "#eab308"
    elif score >= 35:
        return "#f97316"
    return "#ef4444"


def _rec_to_color(rec: str) -> str:
    mapping = {
        "strong_yes": "#22c55e",
        "yes": "#84cc16",
        "maybe": "#eab308",
        "no": "#f97316",
        "strong_no": "#ef4444",
    }
    return mapping.get(rec, "#6b7280")
