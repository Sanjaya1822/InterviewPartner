from typing import Optional, List, Any
from pydantic import BaseModel, Field
from datetime import datetime


class InterviewConfig(BaseModel):
    job_role: str = Field(..., description="e.g., Software Engineer, ML Engineer")
    experience_level: str = Field(..., description="fresher|1year|2years|senior")
    difficulty: str = Field(default="medium", description="easy|medium|hard")
    interview_type: str = Field(..., description="hr|technical|mixed|company_specific|coding")
    duration_minutes: int = Field(default=30, ge=10, le=120)
    company_name: Optional[str] = Field(None, description="For company_specific type")
    resume_id: Optional[str] = None
    personality: str = Field(default="professional", description="friendly|strict|google_style|amazon_style|startup")
    panel_mode: bool = Field(default=False, description="3 AI interviewers")


class StartInterviewResponse(BaseModel):
    session_id: str
    first_question: str
    question_number: int
    total_questions: int
    time_budget_seconds: int = 1800   # interview timer in seconds
    session_info: dict


class AnswerSubmission(BaseModel):
    answer_text: str = Field(..., min_length=1, max_length=10000)
    code_snippet: Optional[str] = Field(None, max_length=50000)
    language: Optional[str] = None
    time_taken_seconds: int = Field(default=0, ge=0)


class QuestionResponse(BaseModel):
    question_id: str
    question_text: str
    question_number: int
    total_questions: int
    question_type: str
    category: Optional[str]
    is_follow_up: bool
    is_last_question: bool


class AnswerFeedback(BaseModel):
    question_id: str
    answer_id: str
    score: float
    technical_score: Optional[float]
    communication_score: Optional[float]
    confidence_score: Optional[float]
    code_quality_score: Optional[float]
    feedback: str
    strengths: List[str]
    improvements: List[str]
    time_complexity: Optional[str]
    space_complexity: Optional[str]
    next_question: Optional[QuestionResponse]
    session_complete: bool


class ProctoringViolation(BaseModel):
    type: str = Field(..., description="no_face|multiple_faces|tab_switched|window_unfocused")
    timestamp: int
    message: str


class SessionSummary(BaseModel):
    session_id: str
    status: str
    overall_score: Optional[float]
    technical_score: Optional[float]
    communication_score: Optional[float]
    confidence_score: Optional[float]
    problem_solving_score: Optional[float]
    code_quality_score: Optional[float]
    grammar_score: Optional[float]
    hiring_recommendation: Optional[str]
    total_questions: int
    duration_seconds: Optional[int]
    started_at: str
    ended_at: Optional[str]

    model_config = {"from_attributes": True}


class InterviewSessionDetail(BaseModel):
    id: str
    user_id: str
    job_role: str
    experience_level: str
    difficulty: str
    interview_type: str
    duration_minutes: int
    company_name: Optional[str]
    personality: str
    status: str
    current_question_index: int
    total_questions: int
    overall_score: Optional[float]
    technical_score: Optional[float]
    communication_score: Optional[float]
    confidence_score: Optional[float]
    hiring_recommendation: Optional[str]
    started_at: Any
    ended_at: Optional[Any]
    duration_seconds: Optional[int]

    model_config = {"from_attributes": True}


class CodeExecutionRequest(BaseModel):
    code: str = Field(..., max_length=50000)
    language: str = Field(..., description="python|javascript|java|cpp")
    test_cases: Optional[List[dict]] = None
    question_id: Optional[str] = None


class CodeExecutionResult(BaseModel):
    success: bool
    output: Optional[str]
    error: Optional[str]
    execution_time_ms: Optional[float]
    test_results: Optional[List[dict]]
    ai_review: Optional[str]
    time_complexity: Optional[str]
    space_complexity: Optional[str]
    optimization_suggestions: Optional[List[str]]
