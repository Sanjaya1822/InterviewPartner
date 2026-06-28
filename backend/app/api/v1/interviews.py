"""
Interview session management endpoints.
"""
import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.core.dependencies import get_current_user
from app.db.base import get_db
from app.db.models import InterviewSession, Question, Answer, Report, Resume, User
from app.schemas.interview import (
    InterviewConfig, StartInterviewResponse, AnswerSubmission,
    AnswerFeedback, SessionSummary, InterviewSessionDetail,
    QuestionResponse, CodeExecutionRequest, CodeExecutionResult,
    ProctoringViolation,
)
from app.services.ai.interview_engine import get_interview_engine
from app.services.resume_service import get_resume_text

router = APIRouter(prefix="/interviews", tags=["Interviews"])
logger = logging.getLogger(__name__)


@router.post("/start", response_model=StartInterviewResponse, status_code=status.HTTP_201_CREATED)
async def start_interview(
    config: InterviewConfig,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Start a new interview session."""
    # Validate resume if provided
    resume_text: Optional[str] = None
    if config.resume_id:
        result = await db.execute(
            select(Resume).where(
                Resume.id == config.resume_id,
                Resume.user_id == str(current_user.id),
            )
        )
        resume = result.scalar_one_or_none()
        if not resume:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Resume not found")
        if resume.status != "ready":
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                f"Resume is not ready for use (status: {resume.status})"
            )
        resume_text = resume.raw_text

    # Create session
    session = InterviewSession(
        user_id=str(current_user.id),
        resume_id=config.resume_id,
        job_role=config.job_role,
        experience_level=config.experience_level,
        difficulty=config.difficulty,
        interview_type=config.interview_type,
        duration_minutes=config.duration_minutes,
        company_name=config.company_name,
        personality=config.personality,
        status="active",
    )
    db.add(session)
    await db.flush()

    # Initialize with AI engine
    engine = get_interview_engine()
    try:
        result = await engine.initialize_session(db, session, resume_text=resume_text)
    except Exception as e:
        logger.error("Failed to initialize interview session: %s", e)
        await db.rollback()
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            f"AI service unavailable: {str(e)}"
        )

    return StartInterviewResponse(
        session_id=str(session.id),
        first_question=result["first_question"],
        question_number=result["question_number"],
        total_questions=result["total_questions"],
        time_budget_seconds=result.get("time_budget_seconds", config.duration_minutes * 60),
        session_info={
            "job_role": config.job_role,
            "experience_level": config.experience_level,
            "difficulty": config.difficulty,
            "interview_type": config.interview_type,
            "company_name": config.company_name,
            "personality": config.personality,
            "question_id": result.get("question_id"),
            "question_type": result.get("question_type"),
            "category": result.get("category"),
        },
    )


@router.post("/{session_id}/answer", response_model=AnswerFeedback)
async def submit_answer(
    session_id: str,
    submission: AnswerSubmission,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Submit an answer for the current question in a session."""
    result = await db.execute(
        select(InterviewSession).where(
            InterviewSession.id == session_id,
            InterviewSession.user_id == str(current_user.id),
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")
    if session.status != "active":
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Session is not active (status: {session.status})"
        )

    engine = get_interview_engine()
    try:
        feedback = await engine.process_answer(
            db=db,
            session=session,
            answer_text=submission.answer_text,
            code_snippet=submission.code_snippet,
            language=submission.language,
            time_taken_seconds=submission.time_taken_seconds,
        )
    except Exception as e:
        logger.error("Answer processing failed: %s", e)
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            f"AI processing failed: {str(e)}"
        )

    next_q = feedback.get("next_question")
    next_question_response = None
    if next_q:
        next_question_response = QuestionResponse(
            question_id=next_q.get("question_id", ""),
            question_text=next_q.get("question_text", ""),
            question_number=next_q.get("question_number", 0),
            total_questions=next_q.get("total_questions", 0),
            question_type=next_q.get("question_type", "general"),
            category=next_q.get("category"),
            is_follow_up=next_q.get("is_follow_up", False),
            is_last_question=next_q.get("is_last_question", False),
        )

    return AnswerFeedback(
        question_id=feedback.get("question_id") or session_id,
        answer_id=feedback.get("answer_id") or "",
        score=feedback.get("score", 0),
        technical_score=feedback.get("technical_score"),
        communication_score=feedback.get("communication_score"),
        confidence_score=feedback.get("confidence_score"),
        code_quality_score=feedback.get("code_quality_score"),
        feedback=feedback.get("feedback", ""),
        strengths=feedback.get("strengths", []),
        improvements=feedback.get("improvements", []),
        time_complexity=feedback.get("time_complexity"),
        space_complexity=feedback.get("space_complexity"),
        next_question=next_question_response,
        session_complete=feedback.get("session_complete", False),
    )


@router.post("/{session_id}/violations")
async def report_violations(
    session_id: str,
    violations: List[ProctoringViolation],
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Log proctoring violations (e.g., face not detected, tab switched) for a session."""
    result = await db.execute(
        select(InterviewSession).where(
            InterviewSession.id == session_id,
            InterviewSession.user_id == str(current_user.id),
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")
    if session.status != "active":
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Session is not active (status: {session.status})"
        )

    current_violations = session.proctoring_violations or []
    for v in violations:
        current_violations.append({
            "type": v.type,
            "timestamp": v.timestamp,
            "message": v.message
        })
        
    # We must explicitly flag the JSON column as modified
    from sqlalchemy.orm.attributes import flag_modified
    session.proctoring_violations = current_violations
    flag_modified(session, "proctoring_violations")
    
    await db.commit()
    return {"status": "success", "violations_logged": len(violations)}


@router.get("/", response_model=List[InterviewSessionDetail])
async def list_sessions(
    status_filter: Optional[str] = None,
    skip: int = 0,
    limit: int = 20,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List interview sessions for the current user."""
    query = (
        select(InterviewSession)
        .where(InterviewSession.user_id == str(current_user.id))
        .order_by(InterviewSession.started_at.desc())
        .offset(skip)
        .limit(limit)
    )
    if status_filter:
        query = query.where(InterviewSession.status == status_filter)

    result = await db.execute(query)
    sessions = result.scalars().all()
    return [_session_to_detail(s) for s in sessions]


@router.get("/{session_id}", response_model=InterviewSessionDetail)
async def get_session(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get details of a specific interview session."""
    result = await db.execute(
        select(InterviewSession).where(
            InterviewSession.id == session_id,
            InterviewSession.user_id == str(current_user.id),
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")
    return _session_to_detail(session)


@router.post("/{session_id}/end", response_model=SessionSummary)
async def end_session(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Manually end an active interview session."""
    from datetime import datetime, timezone

    result = await db.execute(
        select(InterviewSession).where(
            InterviewSession.id == session_id,
            InterviewSession.user_id == str(current_user.id),
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")
    if session.status not in ("active", "paused"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Session is not active")

    # Calculate final scores from answers
    answers_result = await db.execute(
        select(Answer).where(Answer.session_id == session_id)
    )
    answers = answers_result.scalars().all()
    scored_answers = [a for a in answers if a.score is not None]
    overall = sum(a.score for a in scored_answers) / len(scored_answers) if scored_answers else 0

    def _avg(field):
        vals = [getattr(a, field) for a in scored_answers if getattr(a, field) is not None]
        return round(sum(vals) / len(vals), 1) if vals else None

    session.status = "completed"
    session.ended_at = datetime.now(timezone.utc)
    session.overall_score = round(overall, 1)
    session.technical_score     = _avg("technical_score")
    session.communication_score = _avg("communication_score")
    session.confidence_score    = _avg("confidence_score")
    session.grammar_score       = _avg("score")  # fallback to overall per answer
    session.problem_solving_score = _avg("technical_score")  # composite

    if session.started_at and session.ended_at:
        try:
            delta = session.ended_at - session.started_at.replace(tzinfo=timezone.utc) \
                if session.started_at.tzinfo is None else session.ended_at - session.started_at
            session.duration_seconds = max(0, int(delta.total_seconds()))
        except Exception:
            pass

    from app.services.ai.agents import _score_to_recommendation
    session.hiring_recommendation = _score_to_recommendation(overall)

    # Generate report from agent_state if available
    state = session.agent_state or {}
    last_eval = state.get("last_evaluation")
    if last_eval and isinstance(last_eval, dict):
        report_data = last_eval.get("report", {})
        score_breakdown = last_eval.get("score_breakdown", {
            "overall": overall,
            "technical": session.technical_score or overall,
            "communication": session.communication_score or overall,
            "confidence": session.confidence_score or overall,
            "grammar": overall,
            "problem_solving": session.problem_solving_score or overall,
        })
        existing_r = await db.execute(
            select(Report).where(Report.session_id == session_id)
        )
        if not existing_r.scalar_one_or_none():
            from app.db.models import Report
            report = Report(
                session_id=session_id,
                user_id=str(current_user.id),
                executive_summary=report_data.get("executive_summary", "Session ended by candidate."),
                strengths=report_data.get("strengths", []),
                weaknesses=report_data.get("weaknesses", []),
                improvement_areas=report_data.get("improvement_areas", []),
                recommended_topics=report_data.get("recommended_topics", []),
                learning_roadmap=report_data.get("learning_roadmap", []),
                interview_readiness=report_data.get("interview_readiness", "needs_work"),
                score_breakdown=score_breakdown,
                status="ready",
            )
            db.add(report)

    await db.flush()
    return _session_to_summary(session)


@router.get("/{session_id}/questions")
async def get_session_questions(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get all questions and answers for a session."""
    result = await db.execute(
        select(InterviewSession).where(
            InterviewSession.id == session_id,
            InterviewSession.user_id == str(current_user.id),
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")

    q_result = await db.execute(
        select(Question)
        .where(Question.session_id == session_id)
        .order_by(Question.question_number)
    )
    questions = q_result.scalars().all()

    items = []
    for q in questions:
        a_result = await db.execute(
            select(Answer).where(Answer.question_id == str(q.id))
        )
        answer = a_result.scalar_one_or_none()
        items.append({
            "question_id": str(q.id),
            "question_number": q.question_number,
            "question_text": q.question_text,
            "question_type": q.question_type,
            "category": q.category,
            "difficulty": q.difficulty_at_time,
            "is_follow_up": q.is_follow_up,
            "answer": {
                "answer_text": answer.answer_text,
                "score": answer.score,
                "feedback": answer.feedback,
                "strengths": answer.strengths,
                "improvements": answer.improvements,
                "code_snippet": answer.code_snippet,
                "time_complexity": answer.time_complexity,
                "space_complexity": answer.space_complexity,
            } if answer else None,
        })
    return {"session_id": session_id, "questions": items}


@router.get("/{session_id}/hint")
async def get_question_hint(
    session_id: str,
    hint_level: int = 1,  # 1=nudge, 2=rephrase, 3=partial answer
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Get an AI-generated hint for the current question.
    Called by the voice interview when silence is detected.
    
    hint_level:
      1 = encouragement nudge ("Take your time, think about...")
      2 = question rephrased in simpler terms
      3 = partial answer / key points to cover
    """
    result = await db.execute(
        select(InterviewSession).where(
            InterviewSession.id == session_id,
            InterviewSession.user_id == str(current_user.id),
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")
    if session.status != "active":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Session is not active")

    # Get the current question from agent state
    state = session.agent_state or {}
    current_question = state.get("current_question", "the current question")
    job_role = session.job_role
    interview_type = session.interview_type

    from app.services.ai.llm_provider import invoke_with_fallback
    from langchain_core.messages import SystemMessage, HumanMessage

    if hint_level == 1:
        hint_text = (
            f"Take your time — I'm still listening. Think about what you know about this topic. "
            f"There's no rush."
        )
        return {"hint_level": 1, "hint": hint_text, "type": "nudge"}

    elif hint_level == 2:
        # Rephrase the question
        prompt = f"""Rephrase this interview question in simpler, clearer terms to help the candidate understand what is being asked.

Original question: {current_question}
Job role: {job_role}
Interview type: {interview_type}

Return ONLY the rephrased question. Keep it concise and clear."""
        hint_text = await invoke_with_fallback([
            SystemMessage(content="You are a helpful interview coach."),
            HumanMessage(content=prompt),
        ])
        return {"hint_level": 2, "hint": f"Let me rephrase that: {hint_text.strip()}", "type": "rephrase"}

    else:
        # Level 3: Give key points / partial answer
        prompt = f"""The interview candidate is struggling with this question. Provide 2-3 key points or concepts they should cover in their answer, without giving the full answer away.

Question: {current_question}
Job role: {job_role}

Format as: "Here are some key areas to consider: [point 1], [point 2], [point 3]. Take your time and think through each one."

Keep it concise and encouraging. Return ONLY this hint text."""
        hint_text = await invoke_with_fallback([
            SystemMessage(content="You are a supportive interview coach providing gentle guidance."),
            HumanMessage(content=prompt),
        ])
        return {"hint_level": 3, "hint": hint_text.strip(), "type": "partial_answer"}



@router.get("/{session_id}/timer")
async def get_session_timer(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Return the current server-side elapsed/remaining time for the session.
    Used by the frontend to sync the countdown timer with backend truth.
    """
    import time as _time

    result = await db.execute(
        select(InterviewSession).where(
            InterviewSession.id == session_id,
            InterviewSession.user_id == str(current_user.id),
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")

    state = session.agent_state or {}
    start_time = state.get("session_start_time")
    time_budget = state.get("time_budget_seconds", (session.duration_minutes or 30) * 60)

    if start_time:
        elapsed = _time.time() - start_time
    elif session.started_at:
        from datetime import datetime, timezone
        elapsed = (_time.time() - session.started_at.replace(tzinfo=timezone.utc).timestamp())
    else:
        elapsed = 0.0

    remaining = max(0.0, time_budget - elapsed)

    return {
        "session_id": session_id,
        "time_budget_seconds": time_budget,
        "elapsed_seconds": round(elapsed, 1),
        "remaining_seconds": round(remaining, 1),
        "progress_percent": round(min(100.0, (elapsed / time_budget) * 100), 1) if time_budget else 0,
        "is_expired": remaining <= 0,
        "status": session.status,
    }


@router.post("/code/execute", response_model=CodeExecutionResult)
async def execute_code(
    request: CodeExecutionRequest,
    current_user: User = Depends(get_current_user),
):
    """Execute code and return results with AI review."""
    result = await _execute_code_safe(request.code, request.language)

    if request.question_id and result.get("success"):
        # Get AI code review
        from app.services.ai.llm_provider import invoke_with_fallback
        from langchain_core.messages import SystemMessage, HumanMessage

        review_prompt = f"""Review this {request.language} code solution:

```{request.language}
{request.code}
```

Output: {result.get('output', 'N/A')}

Provide:
1. Time complexity analysis
2. Space complexity analysis
3. Code quality assessment (1-3 sentences)
4. Top 2 optimization suggestions

Be concise and specific."""

        ai_review = await invoke_with_fallback([
            SystemMessage(content="You are an expert code reviewer."),
            HumanMessage(content=review_prompt),
        ])
        result["ai_review"] = ai_review

    return CodeExecutionResult(**result)


async def _execute_code_safe(code: str, language: str) -> dict:
    """
    Sandboxed code execution with security hardening:
    - Code size limit (50KB max)
    - Dangerous pattern detection (blocks network/OS/file access)
    - Hard 10-second timeout
    - Output truncation (2KB max)
    - Resource limits where available
    """
    import asyncio
    import tempfile
    import os
    import re
    import time

    _EMPTY_RESULT = {
        "success": False,
        "output": None,
        "error": None,
        "execution_time_ms": None,
        "test_results": None,
        "ai_review": None,
        "time_complexity": None,
        "space_complexity": None,
        "optimization_suggestions": None,
    }

    TIMEOUT_SECS = 10
    MAX_CODE_BYTES = 50_000    # 50 KB code limit
    MAX_OUTPUT_BYTES = 2_000   # 2 KB output limit

    # ── Code size check ───────────────────────────────────────────────────────
    if len(code.encode()) > MAX_CODE_BYTES:
        return {**_EMPTY_RESULT, "error": "Code too large (max 50KB)"}

    # ── Dangerous pattern detection ───────────────────────────────────────────
    DANGEROUS_PATTERNS = {
        "python": [
            r"\bos\s*\.\s*(system|popen|exec|spawn)",
            r"\bsubprocess\b",
            r"\b__import__\s*\(",
            r"\beval\s*\(",
            r"\bexec\s*\(",
            r"\bopen\s*\([^)]*['\"][wWaA]",     # file write
            r"\bsocket\b",
            r"\burllib\b",
            r"\brequests\b",
            r"\bhttpx\b",
            r"\baiohttp\b",
            r"\bimport\s+ctypes\b",
            r"\bpickle\b",
            r"\bshutil\b",
        ],
        "javascript": [
            r"\brequire\s*\(\s*['\"]fs['\"]",
            r"\brequire\s*\(\s*['\"]child_process['\"]",
            r"\brequire\s*\(\s*['\"]net['\"]",
            r"\brequire\s*\(\s*['\"]http['\"]",
            r"\bprocess\s*\.\s*exit\b",
            r"\beval\s*\(",
            r"\bFunction\s*\(",
        ],
    }

    patterns = DANGEROUS_PATTERNS.get(language, [])
    for pattern in patterns:
        if re.search(pattern, code, re.IGNORECASE):
            return {
                **_EMPTY_RESULT,
                "error": f"Code contains restricted operations. For security, network/OS/file access is not allowed."
            }

    # ── Execute ───────────────────────────────────────────────────────────────
    def _make_result(proc, stdout, stderr, start_time):
        elapsed_ms = int((time.time() - start_time) * 1000)
        out = stdout.decode("utf-8", errors="replace")[:MAX_OUTPUT_BYTES] if stdout else None
        err = stderr.decode("utf-8", errors="replace")[:1000] if stderr and proc.returncode != 0 else None
        return {
            "success": proc.returncode == 0,
            "output": out,
            "error": err,
            "execution_time_ms": elapsed_ms,
            "test_results": None,
            "ai_review": None,
            "time_complexity": None,
            "space_complexity": None,
            "optimization_suggestions": None,
        }

    try:
        if language == "python":
            with tempfile.NamedTemporaryFile(suffix=".py", mode="w", delete=False, encoding="utf-8") as f:
                f.write(code)
                fname = f.name
            try:
                start = time.time()
                proc = await asyncio.create_subprocess_exec(
                    "python", fname,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                )
                stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=TIMEOUT_SECS)
                return _make_result(proc, stdout, stderr, start)
            finally:
                os.unlink(fname)

        elif language == "javascript":
            with tempfile.NamedTemporaryFile(suffix=".js", mode="w", delete=False, encoding="utf-8") as f:
                f.write(code)
                fname = f.name
            try:
                start = time.time()
                proc = await asyncio.create_subprocess_exec(
                    "node", "--max-old-space-size=128", fname,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                )
                stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=TIMEOUT_SECS)
                return _make_result(proc, stdout, stderr, start)
            finally:
                os.unlink(fname)

        else:
            return {
                **_EMPTY_RESULT,
                "success": False,
                "error": f"Direct execution for {language} not configured. Code review still available.",
            }

    except asyncio.TimeoutError:
        return {**_EMPTY_RESULT, "error": f"Execution timed out ({TIMEOUT_SECS}s limit)"}
    except Exception as e:
        return {**_EMPTY_RESULT, "error": str(e)}


def _session_to_detail(s: InterviewSession) -> InterviewSessionDetail:
    return InterviewSessionDetail(
        id=str(s.id),
        user_id=str(s.user_id),
        job_role=s.job_role,
        experience_level=s.experience_level,
        difficulty=s.difficulty,
        interview_type=s.interview_type,
        duration_minutes=s.duration_minutes,
        company_name=s.company_name,
        personality=s.personality,
        status=s.status,
        current_question_index=s.current_question_index or 0,
        total_questions=s.total_questions or 0,
        overall_score=s.overall_score,
        technical_score=s.technical_score,
        communication_score=s.communication_score,
        confidence_score=s.confidence_score,
        hiring_recommendation=s.hiring_recommendation,
        started_at=s.started_at.isoformat() if s.started_at else "",
        ended_at=s.ended_at.isoformat() if s.ended_at else None,
        duration_seconds=s.duration_seconds,
    )


def _session_to_summary(s: InterviewSession) -> SessionSummary:
    return SessionSummary(
        session_id=str(s.id),
        status=s.status,
        overall_score=s.overall_score,
        technical_score=s.technical_score,
        communication_score=s.communication_score,
        confidence_score=s.confidence_score,
        problem_solving_score=s.problem_solving_score,
        code_quality_score=s.code_quality_score,
        grammar_score=s.grammar_score,
        hiring_recommendation=s.hiring_recommendation,
        total_questions=s.total_questions or 0,
        duration_seconds=s.duration_seconds,
        started_at=s.started_at.isoformat() if s.started_at else "",
        ended_at=s.ended_at.isoformat() if s.ended_at else None,
    )
