"""
LangGraph orchestration graph for the interview multi-agent system.
"""
import logging
from langgraph.graph import StateGraph, END

from app.services.ai.agent_state import InterviewAgentState
from app.services.ai.agents import (
    question_generator_agent,
    evaluation_agent,
    follow_up_agent,
    memory_agent,
    company_agent,
    report_agent,
    recommendation_agent,
    resume_context_agent,
)

logger = logging.getLogger(__name__)


def should_use_company_agent(state: InterviewAgentState) -> str:
    """Route question generation: company-specific vs standard."""
    if state.get("interview_type") == "company_specific" and state.get("company_name"):
        return "company_agent"
    return "question_generator"


def route_after_evaluation(state: InterviewAgentState) -> str:
    """Route after evaluation: follow-up, next question, or end."""
    next_action = state.get("next_action", "ask_question")
    if state.get("is_complete") or next_action == "end":
        return "report_agent"
    elif next_action == "follow_up":
        return "follow_up_agent"
    else:
        return "memory_check"


def route_after_memory(state: InterviewAgentState) -> str:
    """After memory compression, route to appropriate question generator."""
    return should_use_company_agent(state)


def build_interview_graph() -> StateGraph:
    """Build and compile the full LangGraph interview state machine."""
    graph = StateGraph(InterviewAgentState)

    # Add all agent nodes used in initialization
    graph.add_node("resume_context", resume_context_agent)
    graph.add_node("question_generator", question_generator_agent)
    graph.add_node("company_agent", company_agent)

    # Entry point: always start with resume context processing
    graph.set_entry_point("resume_context")

    # After resume context, generate first question
    graph.add_conditional_edges(
        "resume_context",
        lambda s: should_use_company_agent(s),
        {
            "company_agent": "company_agent",
            "question_generator": "question_generator",
        },
    )

    # Both question generators end at a "question ready" checkpoint (await human input)
    graph.add_edge("question_generator", END)
    graph.add_edge("company_agent", END)

    return graph.compile()


# Singleton compiled graph
_interview_graph = None


def get_interview_graph():
    """Get or create the compiled interview graph."""
    global _interview_graph
    if _interview_graph is None:
        _interview_graph = build_interview_graph()
        logger.info("Interview LangGraph compiled successfully")
    return _interview_graph
