from typing import Optional, List, Any
from pydantic import BaseModel


class ScoreDataPoint(BaseModel):
    date: str
    score: float
    session_id: str


class SkillScore(BaseModel):
    skill: str
    score: float
    max_score: float = 100.0
    level: str  # strong|good|average|weak


class TopicPerformance(BaseModel):
    topic: str
    sessions_count: int
    average_score: float
    trend: str  # improving|stable|declining


class DashboardStats(BaseModel):
    total_sessions: int
    completed_sessions: int
    average_score: float
    total_practice_minutes: int
    best_score: float
    current_streak_days: int
    score_trend: List[ScoreDataPoint]
    skill_breakdown: List[SkillScore]
    topic_performance: List[TopicPerformance]
    recent_sessions: List[Any]
    weekly_goal: int
    weekly_completed: int


class ReportData(BaseModel):
    session_id: str
    job_role: str
    interview_type: str
    overall_score: float
    hiring_recommendation: str
    executive_summary: str
    strengths: List[str]
    weaknesses: List[str]
    improvement_areas: List[str]
    recommended_topics: List[str]
    learning_roadmap: List[dict]
    score_breakdown: dict
    interview_readiness: str
    pdf_url: Optional[str]
    created_at: Any

    model_config = {"from_attributes": True}
