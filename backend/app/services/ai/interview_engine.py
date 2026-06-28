"""
High-level interview engine that wraps LangGraph for the API layer.
Manages session state, database persistence, and WebSocket streaming.
"""
import json
import logging
import time
from datetime import datetime, timezone
from typing import Optional, AsyncIterator

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.models import InterviewSession, Question, Answer, Report
from app.services.ai.agent_state import InterviewAgentState, Message
from app.services.ai.graph import get_interview_graph
from app.services.ai.llm_provider import stream_with_fallback
from app.services.ai.agents import _score_to_recommendation
from app.services.resume_service import get_resume_text
from langchain_core.messages import SystemMessage, HumanMessage

logger = logging.getLogger(__name__)

# Estimated seconds per Q&A exchange for time budget planning
_SECS_PER_QUESTION_EASY = 90    # ~1.5 min per Q for easy
_SECS_PER_QUESTION_MEDIUM = 120  # ~2 min per Q for medium
_SECS_PER_QUESTION_HARD = 180   # ~3 min per Q for hard
_TRANSITION_BUFFER_SECS = 30    # overhead between questions


class InterviewEngine:
    """
    Manages the full lifecycle of an interview session.
    Bridges FastAPI ↔ LangGraph ↔ PostgreSQL.
    """

    def __init__(self):
        self.graph = get_interview_graph()

    async def initialize_session(
        self,
        db: AsyncSession,
        session: InterviewSession,
        resume_text: Optional[str] = None,
    ) -> dict:
        """
        Initialize a new interview session.
        Uses time-budget instead of fixed question count.
        Returns the first question and initial state.
        """
        duration = session.duration_minutes
        time_budget_seconds = duration * 60

        # Compute a soft max_questions cap based on difficulty
        secs_per_q = {
            "easy": _SECS_PER_QUESTION_EASY,
            "medium": _SECS_PER_QUESTION_MEDIUM,
            "hard": _SECS_PER_QUESTION_HARD,
        }.get(session.difficulty, _SECS_PER_QUESTION_MEDIUM)

        usable_budget = max(time_budget_seconds - _TRANSITION_BUFFER_SECS, 60)
        estimated_max_q = max(2, int(usable_budget / secs_per_q))
        # Hard cap so we never try 30+ questions
        max_q = min(estimated_max_q, 20)

        start_time = time.time()

        initial_state: InterviewAgentState = {
            "session_id": str(session.id),
            "user_id": str(session.user_id),
            "job_role": session.job_role,
            "experience_level": session.experience_level,
            "difficulty": session.difficulty,
            "interview_type": session.interview_type,
            "duration_minutes": session.duration_minutes,
            "company_name": session.company_name,
            "personality": session.personality,
            "resume_text": resume_text,
            "resume_skills": [],
            "resume_projects": [],
            "resume_experience": [],
            "resume_certifications": [],
            "messages": [],
            "questions_asked": [],
            "asked_question_texts": [],
            "current_question": None,
            "current_question_id": None,
            "current_question_type": None,
            "current_category": None,
            "awaiting_answer": False,
            "current_difficulty": session.difficulty,
            "consecutive_strong": 0,
            "consecutive_weak": 0,
            "follow_up_count": 0,
            "max_follow_ups": 2,
            "question_number": 0,
            "max_questions": max_q,
            # ── Time-aware fields ──────────────────────────────────────────
            "time_budget_seconds": time_budget_seconds,
            "session_start_time": start_time,
            "elapsed_seconds": 0.0,
            "avg_answer_duration_seconds": secs_per_q,
            "remaining_time_seconds": float(time_budget_seconds),
            # ── Topic coverage ─────────────────────────────────────────────
            "topic_coverage": {},
            # ── Interview plan (populated after planner runs) ──────────────
            "interview_plan": None,
            # ──────────────────────────────────────────────────────────────
            "total_score_so_far": 0.0,
            "scores": [],
            "last_evaluation": None,
            "score_breakdown": None,
            "is_complete": False,
            "end_reason": None,
            "next_action": None,
            "error": None,
        }

        # Run interview_planner_agent first to build a structured topic plan
        from app.services.ai.agents import interview_planner_agent
        try:
            plan_updates = await interview_planner_agent(initial_state)
            initial_state.update(plan_updates)
            logger.info("Interview plan generated: %d topics", len(initial_state.get("interview_plan") or []))
        except Exception as e:
            logger.warning("interview_planner_agent failed (non-fatal): %s", e)

        # Run graph to get first question
        result = await self.graph.ainvoke(initial_state)
        # Persist state to database
        session.agent_state = self._serialize_state(result)
        session.total_questions = result.get("max_questions", max_q)
        session.current_question_index = result.get("question_number", 1)
        await db.flush()

        # Save first question to DB
        await self._save_question(db, result, session.id)

        return {
            "first_question": result.get("current_question", "Tell me about yourself."),
            "question_number": result.get("question_number", 1),
            "total_questions": result.get("max_questions", max_q),
            "question_id": result.get("current_question_id"),
            "question_type": result.get("current_question_type", "general"),
            "category": result.get("current_category", "General"),
            "time_budget_seconds": time_budget_seconds,
        }

    async def process_answer(
        self,
        db: AsyncSession,
        session: InterviewSession,
        answer_text: str,
        code_snippet: Optional[str] = None,
        language: Optional[str] = None,
        time_taken_seconds: int = 0,
    ) -> dict:
        """
        Process a candidate's answer, evaluate it, and return feedback + next question.
        Tracks elapsed time and auto-ends the session when time budget is exhausted.
        """
        # Restore state
        state = self._deserialize_state(session.agent_state)
        if not state:
            raise ValueError("Session state is corrupted or missing")

        # ── Time tracking ──────────────────────────────────────────────────────
        now = time.time()
        session_start = state.get("session_start_time") or now
        elapsed = now - session_start
        time_budget = state.get("time_budget_seconds", session.duration_minutes * 60)
        remaining = max(0.0, time_budget - elapsed)

        # Update rolling average answer duration
        prev_avg = state.get("avg_answer_duration_seconds", 120.0)
        q_count = len(state.get("questions_asked", [])) + 1
        new_avg = (prev_avg * (q_count - 1) + time_taken_seconds) / q_count

        state["elapsed_seconds"] = elapsed
        state["remaining_time_seconds"] = remaining
        state["avg_answer_duration_seconds"] = new_avg

        # Check if time is up — auto-end if less than one more question's worth of time remains
        time_is_up = remaining < new_avg * 0.5
        # ──────────────────────────────────────────────────────────────────────

        # Add human message to state
        human_message: Message = {
            "role": "human",
            "content": answer_text if not code_snippet else f"{answer_text}\n\n```{language or ''}\n{code_snippet}\n```",
            "question_id": state.get("current_question_id"),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        state["messages"] = state.get("messages", []) + [human_message]
        state["awaiting_answer"] = False

        # Save answer to DB
        answer = await self._save_answer(
            db, state, session.id, answer_text, code_snippet, language, time_taken_seconds
        )

        # Run evaluation
        from app.services.ai.agents import (
            evaluation_agent, follow_up_agent, question_generator_agent,
            company_agent, report_agent, recommendation_agent, memory_agent
        )

        state.update(await evaluation_agent(state))
        evaluation = state.get("last_evaluation", {})

        # Run memory compression when conversation grows long (every 10 Q&As)
        msg_count = len(state.get("messages", []))
        if msg_count > 0 and msg_count % 20 == 0:
            try:
                memory_updates = await memory_agent(state)
                if memory_updates:
                    state.update(memory_updates)
                    logger.info("Memory agent compressed conversation (%d messages)", msg_count)
            except Exception as e:
                logger.warning("memory_agent failed (non-fatal): %s", e)

        # Update answer with scores
        if answer and evaluation:
            answer.score = evaluation.get("overall_score")
            answer.technical_score = evaluation.get("technical_accuracy")
            answer.communication_score = evaluation.get("communication_quality")
            answer.confidence_score = evaluation.get("confidence_level")
            answer.code_quality_score = evaluation.get("code_quality")
            answer.feedback = evaluation.get("feedback", "")
            answer.strengths = evaluation.get("strengths", [])
            answer.improvements = evaluation.get("improvements", [])
            answer.time_complexity = evaluation.get("time_complexity")
            answer.space_complexity = evaluation.get("space_complexity")
            await db.flush()

        # Determine next step — time takes priority over question count
        next_action = state.get("next_action", "ask_question")
        is_complete = state.get("is_complete", False) or time_is_up

        if time_is_up and not state.get("is_complete"):
            state["is_complete"] = True
            state["end_reason"] = "time_up"
            is_complete = True
            logger.info("Session %s ended: time budget exhausted (%.0fs elapsed)", session.id, elapsed)

        next_question_data = None

        if is_complete:
            # Generate final report
            state["proctoring_violations"] = session.proctoring_violations
            state.update(await report_agent(state))
            state.update(await recommendation_agent(state))
            await self._finalize_session(db, session, state)
        elif next_action == "follow_up":
            state.update(await follow_up_agent(state))
            await self._save_question(db, state, session.id, is_follow_up=True)
            new_remaining = state.get("remaining_time_seconds", 0)
            next_question_data = {
                "question_id": state.get("current_question_id"),
                "question_text": state.get("current_question"),
                "question_number": state.get("question_number"),
                "total_questions": state.get("max_questions"),
                "question_type": state.get("current_question_type"),
                "category": state.get("current_category"),
                "is_follow_up": True,
                "is_last_question": new_remaining < new_avg,
                "remaining_time_seconds": new_remaining,
            }
        else:
            # Generate next question
            if session.interview_type == "company_specific":
                state.update(await company_agent(state))
            else:
                state.update(await question_generator_agent(state))
            await self._save_question(db, state, session.id)
            new_q_num = state.get("question_number", 0)
            max_q = state.get("max_questions", 10)
            new_remaining = state.get("remaining_time_seconds", 0)
            next_question_data = {
                "question_id": state.get("current_question_id"),
                "question_text": state.get("current_question"),
                "question_number": new_q_num,
                "total_questions": max_q,
                "question_type": state.get("current_question_type"),
                "category": state.get("current_category"),
                "is_follow_up": False,
                "is_last_question": new_q_num >= max_q or new_remaining < new_avg,
                "remaining_time_seconds": new_remaining,
            }

        # Persist updated state
        session.agent_state = self._serialize_state(state)
        session.current_question_index = state.get("question_number", 0)
        await db.flush()

        return {
            "answer_id": str(answer.id) if answer else None,
            "question_id": state.get("current_question_id") if not is_complete else None,
            "score": evaluation.get("overall_score", 0),
            "technical_score": evaluation.get("technical_accuracy"),
            "communication_score": evaluation.get("communication_quality"),
            "confidence_score": evaluation.get("confidence_level"),
            "code_quality_score": evaluation.get("code_quality"),
            "feedback": evaluation.get("feedback", ""),
            "strengths": evaluation.get("strengths", []),
            "improvements": evaluation.get("improvements", []),
            "time_complexity": evaluation.get("time_complexity"),
            "space_complexity": evaluation.get("space_complexity"),
            "next_question": next_question_data,
            "session_complete": is_complete,
        }

    async def stream_question(
        self,
        question_text: str,
    ) -> AsyncIterator[str]:
        """Stream a question word by word for typing effect."""
        from langchain_core.messages import HumanMessage
        # Just yield the text character by character with small delay
        # For real streaming, we stream directly from LLM
        words = question_text.split()
        for i, word in enumerate(words):
            yield word + (" " if i < len(words) - 1 else "")

    # ─────────────────────────────────────────────────────────────────────
    # Private helpers
    # ─────────────────────────────────────────────────────────────────────

    def _serialize_state(self, state: dict) -> dict:
        """Serialize state for JSON storage in PostgreSQL."""
        # Remove non-serializable items
        safe_state = {}
        for k, v in state.items():
            try:
                json.dumps(v)
                safe_state[k] = v
            except (TypeError, ValueError):
                safe_state[k] = str(v)
        return safe_state

    def _deserialize_state(self, state_json: Optional[dict]) -> Optional[InterviewAgentState]:
        import copy
        if not state_json:
            return None
        return copy.deepcopy(state_json)

    async def _save_question(
        self,
        db: AsyncSession,
        state: dict,
        session_id: str,
        is_follow_up: bool = False,
    ) -> Optional[Question]:
        q_id = state.get("current_question_id")
        q_text = state.get("current_question")
        if not q_text:
            return None

        question = Question(
            id=q_id,
            session_id=str(session_id),
            question_number=state.get("question_number", 1),
            question_text=q_text,
            question_type=state.get("current_question_type", "general"),
            category=state.get("current_category"),
            difficulty_at_time=state.get("current_difficulty"),
            is_follow_up=is_follow_up,
        )
        db.add(question)
        await db.flush()
        return question

    async def _save_answer(
        self,
        db: AsyncSession,
        state: dict,
        session_id: str,
        answer_text: str,
        code_snippet: Optional[str],
        language: Optional[str],
        time_taken_seconds: int,
    ) -> Optional[Answer]:
        q_id = state.get("current_question_id")
        if not q_id:
            return None

        try:
            # Always try to fetch first — avoids duplicate key on concurrent submits
            result = await db.execute(select(Answer).where(Answer.question_id == q_id))
            existing_answer = result.scalar_one_or_none()

            if existing_answer:
                # Update in place — voice auto-submit may race with manual submit
                existing_answer.answer_text = answer_text
                existing_answer.code_snippet = code_snippet
                existing_answer.language = language
                existing_answer.time_taken_seconds = time_taken_seconds
                await db.flush()
                return existing_answer
            else:
                answer = Answer(
                    question_id=q_id,
                    session_id=str(session_id),
                    answer_text=answer_text,
                    code_snippet=code_snippet,
                    language=language,
                    time_taken_seconds=time_taken_seconds,
                )
                db.add(answer)
                await db.flush()
                return answer

        except Exception as e:
            # Handle race condition: another concurrent request already inserted
            if "UniqueViolationError" in str(e) or "unique constraint" in str(e).lower():
                logger.warning("Answer already exists for question %s — fetching existing", q_id)
                await db.rollback()
                # Re-open transaction and fetch the existing record
                result = await db.execute(select(Answer).where(Answer.question_id == q_id))
                existing = result.scalar_one_or_none()
                if existing:
                    existing.answer_text = answer_text
                    existing.time_taken_seconds = time_taken_seconds
                    await db.flush()
                    return existing
            raise

    async def _finalize_session(
        self,
        db: AsyncSession,
        session: InterviewSession,
        state: dict,
    ) -> None:
        """Mark session complete and save final scores to both InterviewSession and Report."""
        scores = state.get("scores", [])
        overall = sum(scores) / len(scores) if scores else 0.0

        # Pull dimension scores from score_breakdown (computed by report_agent)
        last_eval = state.get("last_evaluation", {})
        sb = {}
        if isinstance(last_eval, dict):
            sb = last_eval.get("score_breakdown", {})

        # Fallback: compute from questions_asked if score_breakdown is empty
        if not sb:
            from app.services.ai.agents import _compute_dimension_score
            questions_asked = state.get("questions_asked", [])
            sb = {
                "overall":       overall,
                "technical":     _compute_dimension_score(questions_asked, "technical"),
                "communication": _compute_dimension_score(questions_asked, "communication"),
                "confidence":    _compute_dimension_score(questions_asked, "confidence"),
                "grammar":       _compute_dimension_score(questions_asked, "grammar"),
                "problem_solving": _compute_dimension_score(questions_asked, "problem_solving"),
            }

        session.status = "completed"
        session.ended_at = datetime.now(timezone.utc)
        session.overall_score = round(overall, 1)
        session.technical_score = round(float(sb.get("technical", 0) or 0), 1) or None
        session.communication_score = round(float(sb.get("communication", 0) or 0), 1) or None
        session.confidence_score = round(float(sb.get("confidence", 0) or 0), 1) or None
        session.grammar_score = round(float(sb.get("grammar", 0) or 0), 1) or None
        session.problem_solving_score = round(float(sb.get("problem_solving", 0) or 0), 1) or None
        session.hiring_recommendation = _score_to_recommendation(overall)

        # Duration
        if session.started_at:
            delta = session.ended_at - session.started_at.replace(tzinfo=timezone.utc) \
                if session.started_at.tzinfo is None \
                else session.ended_at - session.started_at
            session.duration_seconds = max(0, int(delta.total_seconds()))

        # Save Report
        report_data = {}
        if isinstance(last_eval, dict):
            report_data = last_eval.get("report", {})

        existing_report = await db.execute(
            select(Report).where(Report.session_id == str(session.id))
        )
        existing = existing_report.scalar_one_or_none()

        if not existing:
            report = Report(
                session_id=str(session.id),
                user_id=str(session.user_id),
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
        else:
            # Update existing report with fresh data
            if report_data.get("executive_summary"):
                existing.executive_summary = report_data.get("executive_summary", "")
            if report_data.get("strengths"):
                existing.strengths = report_data.get("strengths", [])
            if report_data.get("weaknesses"):
                existing.weaknesses = report_data.get("weaknesses", [])
            if report_data.get("improvement_areas"):
                existing.improvement_areas = report_data.get("improvement_areas", [])
            if report_data.get("recommended_topics"):
                existing.recommended_topics = report_data.get("recommended_topics", [])
            if report_data.get("learning_roadmap"):
                existing.learning_roadmap = report_data.get("learning_roadmap", [])
            if report_data.get("interview_readiness"):
                existing.interview_readiness = report_data.get("interview_readiness", "needs_work")
            existing.score_breakdown = sb
            existing.status = "ready"

        await db.flush()


# Singleton engine instance
_engine: Optional[InterviewEngine] = None


def get_interview_engine() -> InterviewEngine:
    global _engine
    if _engine is None:
        _engine = InterviewEngine()
    return _engine
