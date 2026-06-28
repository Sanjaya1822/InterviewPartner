"""
All LangGraph agent node functions for the interview system.
Each function takes the AgentState and returns state updates.
"""
import json
import logging
import re
import uuid
from datetime import datetime, timezone
from typing import Optional, List, Dict

from langchain_core.messages import HumanMessage, SystemMessage

from app.services.ai.agent_state import InterviewAgentState, QuestionRecord, Message
from app.services.ai.llm_provider import invoke_with_fallback
from app.services.ai.prompts import (
    get_question_generation_prompt,
    get_evaluation_prompt,
    get_follow_up_prompt,
    get_report_generation_prompt,
    get_company_question_prompt,
)

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# Helper utilities
# ─────────────────────────────────────────────────────────────────────────────

def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _summarize_conversation(messages: list[Message], max_chars: int = 2000) -> str:
    """Create a concise summary of recent conversation for prompts."""
    lines = []
    for m in messages[-10:]:  # last 10 messages
        role = "Interviewer" if m["role"] == "ai" else "Candidate"
        lines.append(f"{role}: {m['content'][:300]}")
    summary = "\n".join(lines)
    return summary[-max_chars:]


def _parse_json_response(text: str) -> dict:
    """Extract JSON from LLM response robustly."""
    # Try direct parse
    try:
        return json.loads(text.strip())
    except json.JSONDecodeError:
        pass

    # Try to extract JSON block
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(0))
        except json.JSONDecodeError:
            pass

    logger.warning("Could not parse JSON from LLM response: %s", text[:200])
    return {}


# ─────────────────────────────────────────────────────────────────────────────
# Agent 1: Question Generator Agent
# ─────────────────────────────────────────────────────────────────────────────

async def question_generator_agent(state: InterviewAgentState) -> dict:
    """
    Generates the next interview question based on session context,
    resume data, and conversation history.

    Uses `topic_coverage` from state to prioritise topics that have been asked
    the LEAST so far, producing a more balanced interview.  After generating a
    question the topic_coverage counter for the inferred category is incremented.
    """
    logger.info("QuestionGenerator: Generating question #%d", state["question_number"] + 1)

    conversation_summary = _summarize_conversation(state.get("messages", []))

    # ── Topic-coverage hint ───────────────────────────────────────────────────
    # Build a hint that tells the LLM which topics are under-represented so it
    # picks those over already-saturated ones.
    topic_coverage: Dict[str, int] = state.get("topic_coverage", {})
    least_covered_topics: List[str] = _get_least_covered_topics(topic_coverage, top_n=3)
    topic_hint = (
        f"Prefer questions from these under-covered topics: {', '.join(least_covered_topics)}."
        if least_covered_topics
        else ""
    )

    prompt = get_question_generation_prompt(
        job_role=state["job_role"],
        experience_level=state["experience_level"],
        difficulty=state["current_difficulty"],
        interview_type=state["interview_type"],
        company_name=state.get("company_name"),
        skills=state.get("resume_skills"),
        asked_questions=state.get("asked_question_texts", []),
        question_number=state["question_number"] + 1,
        conversation_summary=conversation_summary,
    )

    # Append topic hint to the prompt when available
    if topic_hint:
        prompt = f"{prompt}\n\n{topic_hint}"

    question_text = await invoke_with_fallback([
        SystemMessage(content="You are a professional interview question generator."),
        HumanMessage(content=prompt),
    ])
    question_text = question_text.strip()

    # Determine question type
    q_type = state["interview_type"]
    if q_type == "mixed":
        q_type = "technical" if state["question_number"] % 2 == 0 else "behavioral"
    elif q_type == "company_specific":
        q_type = "technical" if state["question_number"] % 3 != 2 else "behavioral"

    question_id = str(uuid.uuid4())
    new_number = state["question_number"] + 1

    # Infer the category and increment its coverage counter
    category = _infer_category(question_text, state["job_role"])
    updated_topic_coverage = dict(topic_coverage)
    updated_topic_coverage[category] = updated_topic_coverage.get(category, 0) + 1

    new_message: Message = {
        "role": "ai",
        "content": question_text,
        "question_id": question_id,
        "timestamp": _now_iso(),
    }

    return {
        "current_question": question_text,
        "current_question_id": question_id,
        "current_question_type": q_type,
        "current_category": category,
        "question_number": new_number,
        "awaiting_answer": True,
        "follow_up_count": 0,
        "messages": [new_message],
        "asked_question_texts": state.get("asked_question_texts", []) + [question_text],
        "topic_coverage": updated_topic_coverage,
        "next_action": "await_answer",
    }


# ─────────────────────────────────────────────────────────────────────────────
# Agent 2: Evaluation Agent
# ─────────────────────────────────────────────────────────────────────────────

async def evaluation_agent(state: InterviewAgentState) -> dict:
    """
    Evaluates the candidate's answer and returns scored feedback.
    """
    logger.info("EvaluationAgent: Evaluating answer for question #%d", state["question_number"])

    # Get the last human message
    human_messages = [m for m in state.get("messages", []) if m["role"] == "human"]
    if not human_messages:
        return {"error": "No answer found to evaluate", "next_action": "ask_question"}

    answer = human_messages[-1]["content"]
    question = state.get("current_question", "")

    # ── Handle Silence Auto-Skip ──────────────────────────────────────────────
    if answer == "[No response — candidate skipped this question]" or not answer.strip():
        logger.info("EvaluationAgent: Candidate skipped due to silence. Bypassing LLM.")
        evaluation = {
            "overall_score": 0.0,
            "technical_accuracy": 0.0,
            "communication_quality": 0.0,
            "confidence_level": 0.0,
            "problem_solving": 0.0,
            "code_quality": None,
            "grammar_clarity": 0.0,
            "feedback": "No response was provided. Moving on to the next question.",
            "strengths": [],
            "improvements": ["Try to provide an answer even if you are unsure", "Practice speaking your thoughts aloud"],
            "answer_quality": "poor",
            "time_complexity": None,
            "space_complexity": None,
        }
    else:
        # Extract code snippet if present
        code_match = re.search(r"```(?:\w+)?\n(.*?)```", answer, re.DOTALL)
        code_snippet = code_match.group(1) if code_match else None

        prompt = get_evaluation_prompt(
            question=question,
            answer=answer,
            job_role=state["job_role"],
            experience_level=state["experience_level"],
            interview_type=state["interview_type"],
            code_snippet=code_snippet,
        )

        response = await invoke_with_fallback([
            SystemMessage(content="You are an expert interview evaluator. Always respond with valid JSON only."),
            HumanMessage(content=prompt),
        ])

        evaluation = _parse_json_response(response)

    if not evaluation:
        # Fallback evaluation
        evaluation = {
            "overall_score": 50.0,
            "technical_accuracy": 50.0,
            "communication_quality": 50.0,
            "confidence_level": 50.0,
            "problem_solving": 50.0,
            "code_quality": None,
            "grammar_clarity": 50.0,
            "feedback": "Answer evaluated. Please continue.",
            "strengths": ["Attempted the question"],
            "improvements": ["Provide more specific examples"],
            "answer_quality": "average",
            "time_complexity": None,
            "space_complexity": None,
        }

    score = float(evaluation.get("overall_score", 50))
    scores = state.get("scores", []) + [score]

    # ── Per-dimension scores from evaluation ─────────────────────────────────
    # Map evaluation fields → QuestionRecord fields so they can be averaged
    # later by _compute_dimension_score without any approximation.
    technical_score: Optional[float] = _safe_float(
        evaluation.get("technical_accuracy") or evaluation.get("technical_score")
    )
    communication_score: Optional[float] = _safe_float(
        evaluation.get("communication_quality") or evaluation.get("communication_score")
    )
    confidence_score: Optional[float] = _safe_float(
        evaluation.get("confidence_level") or evaluation.get("confidence_score")
    )
    grammar_score: Optional[float] = _safe_float(
        evaluation.get("grammar_clarity") or evaluation.get("grammar_score")
    )

    # Update question record
    questions_asked = state.get("questions_asked", []).copy()
    new_record: QuestionRecord = {
        "question_id": state.get("current_question_id", str(uuid.uuid4())),
        "question_text": question,
        "question_type": state.get("current_question_type", "technical"),
        "category": state.get("current_category", "General"),
        "difficulty": state["current_difficulty"],
        "is_follow_up": state.get("follow_up_count", 0) > 0,
        "answer_text": answer,
        "score": score,
        "strengths": evaluation.get("strengths", []),
        "improvements": evaluation.get("improvements", []),
        # Per-answer dimension scores — populated from evaluation response
        "technical_score": technical_score,
        "communication_score": communication_score,
        "confidence_score": confidence_score,
        "grammar_score": grammar_score,
        "time_taken_seconds": None,  # can be set by the caller/graph if tracked
    }
    questions_asked.append(new_record)

    # Adaptive difficulty
    new_difficulty = state["current_difficulty"]
    consecutive_strong = state.get("consecutive_strong", 0)
    consecutive_weak = state.get("consecutive_weak", 0)

    if score >= 80:
        consecutive_strong += 1
        consecutive_weak = 0
        if consecutive_strong >= 2 and new_difficulty != "hard":
            new_difficulty = {"easy": "medium", "medium": "hard"}.get(new_difficulty, new_difficulty)
            consecutive_strong = 0
    elif score < 50:
        consecutive_weak += 1
        consecutive_strong = 0
        if consecutive_weak >= 2 and new_difficulty != "easy":
            new_difficulty = {"hard": "medium", "medium": "easy"}.get(new_difficulty, new_difficulty)
            consecutive_weak = 0
    else:
        consecutive_strong = 0
        consecutive_weak = 0

    # Decide next action
    should_follow_up = (
        score < 65
        and state.get("follow_up_count", 0) < state.get("max_follow_ups", 2)
        and state["interview_type"] != "hr"  # HR interviews move on
    )

    is_complete = state["question_number"] >= state["max_questions"]
    next_action = "end" if is_complete else ("follow_up" if should_follow_up else "ask_question")

    return {
        "last_evaluation": evaluation,
        "questions_asked": questions_asked,
        "scores": scores,
        "consecutive_strong": consecutive_strong,
        "consecutive_weak": consecutive_weak,
        "current_difficulty": new_difficulty,
        "awaiting_answer": False,
        "is_complete": is_complete,
        "next_action": next_action,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Agent 3: Follow-up Agent
# ─────────────────────────────────────────────────────────────────────────────

async def follow_up_agent(state: InterviewAgentState) -> dict:
    """
    Generates a contextual follow-up question based on the last answer.
    """
    logger.info("FollowUpAgent: Generating follow-up #%d", state.get("follow_up_count", 0) + 1)

    human_messages = [m for m in state.get("messages", []) if m["role"] == "human"]
    last_answer = human_messages[-1]["content"] if human_messages else ""

    conv_history = _summarize_conversation(state.get("messages", []), max_chars=1500)

    prompt = get_follow_up_prompt(
        original_question=state.get("current_question", ""),
        candidate_answer=last_answer,
        conversation_history=conv_history,
        job_role=state["job_role"],
        follow_up_number=state.get("follow_up_count", 0) + 1,
    )

    follow_up_text = await invoke_with_fallback([
        SystemMessage(content="You are a professional interviewer generating targeted follow-up questions."),
        HumanMessage(content=prompt),
    ])
    follow_up_text = follow_up_text.strip()

    follow_up_id = str(uuid.uuid4())
    follow_up_count = state.get("follow_up_count", 0) + 1

    new_message: Message = {
        "role": "ai",
        "content": follow_up_text,
        "question_id": follow_up_id,
        "timestamp": _now_iso(),
    }

    return {
        "current_question": follow_up_text,
        "current_question_id": follow_up_id,
        "follow_up_count": follow_up_count,
        "awaiting_answer": True,
        "messages": [new_message],
        "asked_question_texts": state.get("asked_question_texts", []) + [follow_up_text],
        "next_action": "await_answer",
    }


# ─────────────────────────────────────────────────────────────────────────────
# Agent 4: Memory Agent
# ─────────────────────────────────────────────────────────────────────────────

async def memory_agent(state: InterviewAgentState) -> dict:
    """
    Compresses conversation history when it gets too long.
    Prevents token limit issues in long interviews.
    """
    messages = state.get("messages", [])

    # Only compress if we have a lot of messages
    if len(messages) <= 20:
        return {}  # no-op

    logger.info("MemoryAgent: Compressing conversation history (%d messages)", len(messages))

    # Keep the last 10 messages verbatim
    recent_messages = messages[-10:]
    older_messages = messages[:-10]

    # Summarize older messages
    older_text = "\n".join(
        f"{'Interviewer' if m['role'] == 'ai' else 'Candidate'}: {m['content'][:200]}"
        for m in older_messages
    )

    summary_prompt = f"""Summarize this interview conversation concisely, preserving key facts:
- What questions were asked
- What the candidate mentioned about their skills/experience  
- Performance patterns (strong/weak areas)

Conversation:
{older_text}

Summary (3-5 sentences):"""

    summary = await invoke_with_fallback([
        SystemMessage(content="You are a memory summarizer. Be concise and factual."),
        HumanMessage(content=summary_prompt),
    ])

    # Create a synthetic summary message
    summary_message: Message = {
        "role": "ai",
        "content": f"[CONVERSATION SUMMARY]\n{summary.strip()}",
        "question_id": None,
        "timestamp": _now_iso(),
    }

    return {
        "messages": [summary_message] + recent_messages,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Agent 5: Resume Agent
# ─────────────────────────────────────────────────────────────────────────────

async def resume_context_agent(state: InterviewAgentState) -> dict:
    """
    Processes resume context at the start of the interview to personalise questions.
    Called once during initialisation.

    Extracts:
    - resume_skills        : technical + soft skills
    - resume_projects      : up to 5 project names / descriptions
    - resume_experience    : up to 5 job-title / company entries
    - resume_certifications: any certifications mentioned
    """
    if not state.get("resume_text"):
        return {
            "resume_skills": [],
            "resume_projects": [],
            "resume_experience": [],
            "resume_certifications": [],
        }

    logger.info("ResumeAgent: Extracting structured context from resume")

    prompt = f"""You are an expert resume parser. Carefully read the resume below and extract \
structured data for use in a technical interview.

RESUME TEXT:
{state['resume_text'][:3000]}

Instructions:
- "skills": list every distinct technical and soft skill mentioned (e.g. Python, React, Leadership).
- "projects": up to 5 entries — for each project provide a short one-sentence description \
  including its name and key technologies (e.g. "E-commerce API built with FastAPI and PostgreSQL").
- "experience": up to 5 entries — each entry should read as "<Job Title> at <Company> (<duration>)" \
  (e.g. "Senior Software Engineer at Acme Corp (2 years)"). Omit if not present.
- "certifications": list any professional certifications or courses (e.g. "AWS Certified Developer"). \
  Return an empty list if none are mentioned.
- "primary_technologies": top 5 technologies most frequently mentioned.
- "suggested_question_topics": 3-5 interview topic areas that would be most relevant given the resume.

Return ONLY valid JSON — no prose, no markdown fences:
{{
    "skills": ["skill1", "skill2"],
    "projects": ["Project A — built with X and Y for Z purpose"],
    "experience": ["Senior Engineer at FooBar (3 years)"],
    "certifications": ["AWS Certified Developer"],
    "primary_technologies": ["Python", "React"],
    "suggested_question_topics": ["System Design", "Python OOP"]
}}"""

    response = await invoke_with_fallback([
        SystemMessage(content="You are a resume analysis expert. Return only valid JSON with no extra text."),
        HumanMessage(content=prompt),
    ])

    data = _parse_json_response(response)

    return {
        "resume_skills":        data.get("skills", []),
        "resume_projects":      data.get("projects", [])[:5],
        "resume_experience":    data.get("experience", [])[:5],
        "resume_certifications": data.get("certifications", []),
    }


# ─────────────────────────────────────────────────────────────────────────────
# Agent 6: Company-Specific Agent
# ─────────────────────────────────────────────────────────────────────────────

async def company_agent(state: InterviewAgentState) -> dict:
    """
    Generates company-specific questions when interview_type is 'company_specific'.
    """
    company = state.get("company_name", "tech company")
    logger.info("CompanyAgent: Generating question for %s", company)

    q_type = "behavioral" if state["question_number"] % 3 == 2 else "technical"
    prompt = get_company_question_prompt(
        company=company,
        job_role=state["job_role"],
        question_type=q_type,
    )

    question_text = await invoke_with_fallback([
        SystemMessage(content=f"You are an interviewer from {company}."),
        HumanMessage(content=prompt),
    ])
    question_text = question_text.strip()

    question_id = str(uuid.uuid4())

    new_message: Message = {
        "role": "ai",
        "content": question_text,
        "question_id": question_id,
        "timestamp": _now_iso(),
    }

    return {
        "current_question": question_text,
        "current_question_id": question_id,
        "current_question_type": q_type,
        "current_category": company,
        "question_number": state["question_number"] + 1,
        "awaiting_answer": True,
        "messages": [new_message],
        "asked_question_texts": state.get("asked_question_texts", []) + [question_text],
        "next_action": "await_answer",
    }


# ─────────────────────────────────────────────────────────────────────────────
# Agent 7: Report Agent
# ─────────────────────────────────────────────────────────────────────────────

async def report_agent(state: InterviewAgentState) -> dict:
    """
    Generates the final comprehensive interview report.
    """
    logger.info("ReportAgent: Generating final report for session %s", state["session_id"])

    questions_asked = state.get("questions_asked", [])
    scores = state.get("scores", [])
    overall_score = sum(scores) / len(scores) if scores else 0.0

    qa_list = []
    for record in questions_asked:
        qa_list.append({
            "question": record.get("question_text", ""),
            "answer": record.get("answer_text", ""),
            "score": record.get("score", 0),
        })

    # Calculate dimension scores using real per-question evaluation data
    score_breakdown = {
        "overall":          overall_score,
        "technical":        _compute_dimension_score(questions_asked, "technical"),
        "communication":    _compute_dimension_score(questions_asked, "communication"),
        "confidence":       _compute_dimension_score(questions_asked, "confidence"),
        "grammar":          _compute_dimension_score(questions_asked, "grammar"),
        # problem_solving is the average of technical + confidence as a reasonable
        # composite — still real data rather than a fixed multiplier
        "problem_solving":  _compute_dimension_score(questions_asked, "problem_solving"),
        "questions_count":  len(questions_asked),
    }

    # Apply proctoring penalty to confidence and overall score
    proctoring_violations = state.get("proctoring_violations") or []
    penalty = min(len(proctoring_violations) * 5, 30) # 5 points per violation, max 30 points penalty
    if penalty > 0:
        score_breakdown["confidence"] = max(0.0, score_breakdown["confidence"] - penalty)
        overall_score = max(0.0, overall_score - (penalty * 0.2)) # overall score impacted slightly

    prompt = get_report_generation_prompt(
        job_role=state["job_role"],
        experience_level=state["experience_level"],
        interview_type=state["interview_type"],
        questions_and_answers=qa_list,
        score_breakdown=score_breakdown,
        overall_score=overall_score,
        proctoring_violations=proctoring_violations,
    )

    response = await invoke_with_fallback([
        SystemMessage(content="You are an expert interview performance analyst. Return only valid JSON."),
        HumanMessage(content=prompt),
    ])

    report_data = _parse_json_response(response)

    if not report_data:
        report_data = {
            "executive_summary": f"The candidate completed a {state['interview_type']} interview for {state['job_role']}.",
            "hiring_recommendation": _score_to_recommendation(overall_score),
            "interview_readiness": _score_to_readiness(overall_score),
            "strengths": ["Completed the interview"],
            "weaknesses": ["Could improve depth of answers"],
            "improvement_areas": ["Practice more technical questions"],
            "recommended_topics": ["Data Structures", "System Design", "Communication"],
            "learning_roadmap": [],
            "confidence_assessment": "Assessment in progress.",
            "communication_assessment": "Assessment in progress.",
            "technical_assessment": "Assessment in progress.",
        }

    return {
        "last_evaluation": {
            "report": report_data,
            "overall_score": overall_score,
            "score_breakdown": score_breakdown,
        },
        "is_complete": True,
        "end_reason": "max_questions",
    }


# ─────────────────────────────────────────────────────────────────────────────
# Agent 8: Recommendation Agent
# ─────────────────────────────────────────────────────────────────────────────

async def recommendation_agent(state: InterviewAgentState) -> dict:
    """
    Generates personalized learning roadmap based on performance.
    """
    logger.info("RecommendationAgent: Generating personalized roadmap")

    questions_asked = state.get("questions_asked", [])
    scores = state.get("scores", [])
    overall_score = sum(scores) / len(scores) if scores else 0.0

    weak_areas = [
        r["category"] for r in questions_asked
        if r.get("score", 100) < 60
    ]
    weak_areas_str = ", ".join(set(weak_areas)) if weak_areas else "General improvement needed"

    prompt = f"""Generate a 4-week personalized learning roadmap for a {state['job_role']} candidate.

Overall interview score: {overall_score:.1f}/100
Weak areas: {weak_areas_str}
Experience level: {state['experience_level']}

Return JSON array of weekly plans:
[
    {{
        "week": 1,
        "focus": "Topic name",
        "resources": ["Resource 1", "Resource 2"],
        "goals": ["Goal 1", "Goal 2"],
        "practice_problems": ["Problem type 1"]
    }}
]"""

    response = await invoke_with_fallback([
        SystemMessage(content="You are a technical career coach. Return only valid JSON."),
        HumanMessage(content=prompt),
    ])

    roadmap = []
    try:
        roadmap_raw = response.strip()
        if roadmap_raw.startswith("["):
            roadmap = json.loads(roadmap_raw)
        else:
            match = re.search(r"\[.*\]", roadmap_raw, re.DOTALL)
            if match:
                roadmap = json.loads(match.group(0))
    except Exception:
        roadmap = []

    # Merge into existing report
    last_eval = state.get("last_evaluation", {})
    if isinstance(last_eval, dict) and "report" in last_eval:
        last_eval["report"]["learning_roadmap"] = roadmap

    return {
        "last_evaluation": last_eval,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Helper functions
# ─────────────────────────────────────────────────────────────────────────────

def _infer_category(question: str, job_role: str) -> str:
    """Infer the question category from its text."""
    question_lower = question.lower()
    categories = {
        "Python": ["python", "django", "flask", "fastapi"],
        "Java": ["java", "spring", "jvm"],
        "JavaScript": ["javascript", "js", "node", "react", "vue"],
        "Data Structures": ["array", "tree", "graph", "hash", "linked list", "stack", "queue"],
        "Algorithms": ["sort", "search", "algorithm", "complexity", "time complexity"],
        "System Design": ["design", "scalable", "distributed", "microservice", "architecture"],
        "Machine Learning": ["machine learning", "ml", "model", "training", "neural", "deep learning"],
        "Database": ["sql", "database", "query", "postgres", "mysql", "mongodb"],
        "Cloud": ["aws", "azure", "gcp", "cloud", "kubernetes", "docker"],
        "Behavioral": ["tell me", "describe", "how did you", "when have you", "conflict", "leadership"],
        "OOP": ["oop", "class", "inheritance", "polymorphism", "abstraction", "encapsulation"],
        "Operating Systems": ["process", "thread", "deadlock", "memory management", "scheduler"],
        "Networking": ["tcp", "http", "dns", "rest", "api", "websocket"],
    }
    for category, keywords in categories.items():
        if any(kw in question_lower for kw in keywords):
            return category
    return "General"


def _compute_dimension_score(questions: list, dimension: str) -> float:
    """
    Compute a per-dimension average score from the actual per-question evaluation
    data stored in each QuestionRecord.

    Falls back gracefully:
    - If dedicated dimension fields are missing, falls back to the overall score
      or a filtered subset (e.g. technical questions only for the technical dimension).
    - Returns 50.0 when no data is available.
    """
    if not questions:
        return 50.0

    if dimension == "technical":
        # Prefer the dedicated technical_score field; fall back to overall score
        # for technical-type questions only.
        values = [
            q["technical_score"]
            for q in questions
            if q.get("technical_score") is not None
        ]
        if not values:
            # Fallback: overall scores of technical questions
            values = [
                q["score"]
                for q in questions
                if q.get("question_type") == "technical" and q.get("score") is not None
            ]
        return sum(values) / len(values) if values else 50.0

    elif dimension == "communication":
        values = [
            q["communication_score"]
            for q in questions
            if q.get("communication_score") is not None
        ]
        if not values:
            # Fallback: overall scores of all questions (communication affects all)
            values = [q["score"] for q in questions if q.get("score") is not None]
        return sum(values) / len(values) if values else 50.0

    elif dimension == "confidence":
        values = [
            q["confidence_score"]
            for q in questions
            if q.get("confidence_score") is not None
        ]
        if not values:
            values = [q["score"] for q in questions if q.get("score") is not None]
        return sum(values) / len(values) if values else 50.0

    elif dimension == "grammar":
        values = [
            q["grammar_score"]
            for q in questions
            if q.get("grammar_score") is not None
        ]
        if not values:
            values = [q["score"] for q in questions if q.get("score") is not None]
        return sum(values) / len(values) if values else 50.0

    elif dimension == "problem_solving":
        # Composite of technical + confidence scores where both are available;
        # otherwise fall back to overall scores.
        composites = []
        for q in questions:
            t = q.get("technical_score")
            c = q.get("confidence_score")
            if t is not None and c is not None:
                composites.append((t + c) / 2.0)
            elif t is not None:
                composites.append(t)
            elif c is not None:
                composites.append(c)
        if not composites:
            composites = [q["score"] for q in questions if q.get("score") is not None]
        return sum(composites) / len(composites) if composites else 50.0

    # Unknown dimension — return the simple overall average
    values = [q["score"] for q in questions if q.get("score") is not None]
    return sum(values) / len(values) if values else 50.0


def _score_to_recommendation(score: float) -> str:
    if score >= 85:
        return "strong_yes"
    elif score >= 70:
        return "yes"
    elif score >= 55:
        return "maybe"
    elif score >= 40:
        return "no"
    return "strong_no"


def _score_to_readiness(score: float) -> str:
    if score >= 80:
        return "ready"
    elif score >= 65:
        return "almost_ready"
    elif score >= 45:
        return "needs_work"
    return "not_ready"


def _safe_float(value) -> Optional[float]:
    """Safely convert a value to float, returning None on failure."""
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _get_least_covered_topics(topic_coverage: Dict[str, int], top_n: int = 3) -> List[str]:
    """
    Return the `top_n` topic names that have the lowest ask-count.
    When topic_coverage is empty the function returns an empty list so the
    caller can skip the hint gracefully.
    """
    if not topic_coverage:
        return []
    # Sort ascending by count so lowest-covered topics come first
    sorted_topics = sorted(topic_coverage.items(), key=lambda kv: kv[1])
    return [topic for topic, _ in sorted_topics[:top_n]]


# ─────────────────────────────────────────────────────────────────────────────
# Agent 9: Interview Planner Agent
# ─────────────────────────────────────────────────────────────────────────────

async def interview_planner_agent(state: InterviewAgentState) -> dict:
    """
    Generates a structured interview plan at the start of a session.

    Reads job_role, experience_level, difficulty, interview_type,
    duration_minutes, and resume_skills from state then asks the LLM to
    produce a list of topic areas with time allocations and priorities.

    Result is stored in state as:
        interview_plan: List[dict]  —  each dict has keys:
            topic               (str)
            time_allocation_seconds (int)
            priority            ("high" | "medium" | "low")
    """
    logger.info(
        "InterviewPlannerAgent: Building plan for %s / %s / %s",
        state["job_role"],
        state["experience_level"],
        state["interview_type"],
    )

    duration_seconds = state.get("duration_minutes", 30) * 60
    skills_hint = ", ".join(state.get("resume_skills") or []) or "not specified"

    prompt = f"""You are a senior technical interviewer designing a structured interview plan.

Role         : {state['job_role']}
Experience   : {state['experience_level']}
Difficulty   : {state.get('difficulty', state.get('current_difficulty', 'medium'))}
Interview type: {state['interview_type']}
Total time   : {state.get('duration_minutes', 30)} minutes ({duration_seconds} seconds)
Candidate skills from resume: {skills_hint}

Create a detailed interview plan as a JSON array.  Each element must have:
  - "topic"                  : name of the topic area (e.g. "Python Basics")
  - "time_allocation_seconds": integer number of seconds to spend on this topic
  - "priority"               : one of "high", "medium", or "low"

Rules:
  1. The sum of all time_allocation_seconds MUST equal {duration_seconds}.
  2. Include 3-7 topics appropriate for the role and interview type.
  3. Align priorities with the job role (e.g. System Design = high for senior roles).
  4. For a "behavioral" interview type include at least 2 behavioral topics.
  5. For a "technical" interview type behavioural topics should be low-priority.

Return ONLY a valid JSON array — no prose, no markdown:
[
  {{"topic": "Python Basics", "time_allocation_seconds": 600, "priority": "high"}},
  {{"topic": "OOP Concepts",  "time_allocation_seconds": 480, "priority": "medium"}}
]"""

    response = await invoke_with_fallback([
        SystemMessage(content="You are an expert interview planner. Return only valid JSON."),
        HumanMessage(content=prompt),
    ])

    # Parse array response
    interview_plan: List[dict] = []
    try:
        raw = response.strip()
        # Support both bare array and JSON wrapped in a code block
        if raw.startswith("["):
            interview_plan = json.loads(raw)
        else:
            array_match = re.search(r"\[.*\]", raw, re.DOTALL)
            if array_match:
                interview_plan = json.loads(array_match.group(0))
    except Exception as exc:
        logger.warning("InterviewPlannerAgent: Failed to parse plan JSON: %s", exc)
        interview_plan = []

    # Validate and normalise each entry
    validated_plan: List[dict] = []
    for entry in interview_plan:
        if not isinstance(entry, dict):
            continue
        validated_plan.append({
            "topic":                   str(entry.get("topic", "General")),
            "time_allocation_seconds": int(entry.get("time_allocation_seconds", 0)),
            "priority":                str(entry.get("priority", "medium")),
        })

    # Fallback: generate a basic plan if LLM failed
    if not validated_plan:
        logger.warning("InterviewPlannerAgent: Using fallback plan")
        topics = _default_plan_topics(state["interview_type"], state["job_role"])
        per_topic = duration_seconds // len(topics) if topics else duration_seconds
        validated_plan = [
            {"topic": t, "time_allocation_seconds": per_topic, "priority": "medium"}
            for t in topics
        ]

    logger.info(
        "InterviewPlannerAgent: Plan has %d topics covering %d seconds",
        len(validated_plan),
        sum(e["time_allocation_seconds"] for e in validated_plan),
    )

    return {"interview_plan": validated_plan}


def _default_plan_topics(interview_type: str, job_role: str) -> List[str]:
    """Return a generic list of topics when the LLM plan cannot be parsed."""
    if interview_type == "behavioral":
        return ["Introduction", "Leadership & Teamwork", "Problem Solving",
                "Conflict Resolution", "Career Goals"]
    if interview_type == "hr":
        return ["Introduction", "Salary & Expectations", "Culture Fit",
                "Availability", "Questions for Us"]
    # Default: technical / mixed / company_specific
    role_lower = job_role.lower()
    if "data" in role_lower or "ml" in role_lower:
        return ["Python Basics", "Statistics & ML", "Data Engineering",
                "Model Evaluation", "Behavioural"]
    if "frontend" in role_lower:
        return ["JavaScript", "HTML & CSS", "React / Framework",
                "Performance", "Behavioural"]
    return ["Core Language", "Data Structures", "Algorithms",
            "System Design", "Behavioural"]
