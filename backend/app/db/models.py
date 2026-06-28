"""
All SQLAlchemy ORM models for the AI Interview Practice Partner.
"""
import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import (
    Boolean, Column, DateTime, Enum, Float, ForeignKey,
    Integer, JSON, String, Text, func
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.db.base import Base


def generate_uuid():
    return str(uuid.uuid4())


class TimestampMixin:
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


# ─────────────────────────────────────────────────────────────────────────────
# Users
# ─────────────────────────────────────────────────────────────────────────────

class User(Base, TimestampMixin):
    __tablename__ = "users"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    email = Column(String(255), unique=True, index=True, nullable=False)
    username = Column(String(100), unique=True, index=True, nullable=False)
    full_name = Column(String(255), nullable=True)
    hashed_password = Column(String(255), nullable=True)  # nullable for OAuth users
    avatar_url = Column(String(512), nullable=True)
    google_id = Column(String(255), unique=True, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    is_verified = Column(Boolean, default=False, nullable=False)
    role = Column(String(50), default="user", nullable=False)  # user | admin

    # Relationships
    resumes = relationship("Resume", back_populates="user", cascade="all, delete-orphan")
    interview_sessions = relationship("InterviewSession", back_populates="user", cascade="all, delete-orphan")
    settings = relationship("UserSettings", back_populates="user", uselist=False, cascade="all, delete-orphan")
    achievements = relationship("Achievement", back_populates="user", cascade="all, delete-orphan")
    progress = relationship("UserProgress", back_populates="user", cascade="all, delete-orphan")


class UserSettings(Base, TimestampMixin):
    __tablename__ = "user_settings"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False)
    theme = Column(String(20), default="dark")
    language = Column(String(10), default="en")
    notifications_enabled = Column(Boolean, default=True)
    default_difficulty = Column(String(20), default="medium")
    default_job_role = Column(String(100), nullable=True)
    weekly_goal_sessions = Column(Integer, default=3)

    user = relationship("User", back_populates="settings")


# ─────────────────────────────────────────────────────────────────────────────
# Resumes
# ─────────────────────────────────────────────────────────────────────────────

class Resume(Base, TimestampMixin):
    __tablename__ = "resumes"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    filename = Column(String(255), nullable=False)
    file_path = Column(String(512), nullable=False)
    file_size = Column(Integer, nullable=False)
    mime_type = Column(String(100), nullable=False)
    status = Column(
        String(50),
        default="pending", nullable=False
    )
    # Parsed content
    raw_text = Column(Text, nullable=True)
    parsed_data = Column(JSON, nullable=True)  # structured: name, email, skills, experience, education, projects
    skill_summary = Column(Text, nullable=True)
    missing_skills = Column(JSON, nullable=True)  # list of strings
    chroma_doc_id = Column(String(255), nullable=True)  # reference to ChromaDB document
    parse_error = Column(Text, nullable=True)

    user = relationship("User", back_populates="resumes")
    interview_sessions = relationship("InterviewSession", back_populates="resume")


# ─────────────────────────────────────────────────────────────────────────────
# Interview Sessions
# ─────────────────────────────────────────────────────────────────────────────

class InterviewSession(Base, TimestampMixin):
    __tablename__ = "interview_sessions"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    resume_id = Column(String(36), ForeignKey("resumes.id", ondelete="SET NULL"), nullable=True)

    # Configuration
    job_role = Column(String(100), nullable=False)
    experience_level = Column(String(50), nullable=False)  # fresher|1year|2years|senior
    difficulty = Column(String(20), nullable=False)         # easy|medium|hard
    interview_type = Column(String(50), nullable=False)     # hr|technical|mixed|company_specific|coding
    duration_minutes = Column(Integer, default=30)
    company_name = Column(String(100), nullable=True)       # for company-specific interviews
    personality = Column(String(50), default="professional") # friendly|strict|google_style|amazon_style|startup

    # State
    status = Column(
        String(50),
        default="active", nullable=False
    )
    current_question_index = Column(Integer, default=0)
    total_questions = Column(Integer, default=0)

    # Scores
    overall_score = Column(Float, nullable=True)
    technical_score = Column(Float, nullable=True)
    communication_score = Column(Float, nullable=True)
    confidence_score = Column(Float, nullable=True)
    problem_solving_score = Column(Float, nullable=True)
    code_quality_score = Column(Float, nullable=True)
    grammar_score = Column(Float, nullable=True)

    # Meta
    started_at = Column(DateTime(timezone=True), server_default=func.now())
    ended_at = Column(DateTime(timezone=True), nullable=True)
    duration_seconds = Column(Integer, nullable=True)
    agent_state = Column(JSON, nullable=True)  # LangGraph state snapshot
    hiring_recommendation = Column(String(50), nullable=True)  # strong_yes|yes|maybe|no|strong_no
    proctoring_violations = Column(JSON, nullable=True) # list of violation dicts

    user = relationship("User", back_populates="interview_sessions")
    resume = relationship("Resume", back_populates="interview_sessions")
    questions = relationship("Question", back_populates="session", cascade="all, delete-orphan", order_by="Question.question_number")
    report = relationship("Report", back_populates="session", uselist=False, cascade="all, delete-orphan")


# ─────────────────────────────────────────────────────────────────────────────
# Questions & Answers
# ─────────────────────────────────────────────────────────────────────────────

class Question(Base, TimestampMixin):
    __tablename__ = "questions"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    session_id = Column(String(36), ForeignKey("interview_sessions.id", ondelete="CASCADE"), nullable=False)
    question_number = Column(Integer, nullable=False)
    question_text = Column(Text, nullable=False)
    question_type = Column(String(50), nullable=False)  # technical|behavioral|coding|system_design|follow_up
    category = Column(String(100), nullable=True)       # e.g., "Python", "Data Structures", "STAR"
    difficulty_at_time = Column(String(20), nullable=True)
    expected_answer_outline = Column(Text, nullable=True)
    is_follow_up = Column(Boolean, default=False)
    parent_question_id = Column(String(36), ForeignKey("questions.id"), nullable=True)

    session = relationship("InterviewSession", back_populates="questions")
    answer = relationship("Answer", back_populates="question", uselist=False, cascade="all, delete-orphan")
    follow_ups = relationship("Question", back_populates="parent_question")
    parent_question = relationship("Question", remote_side="Question.id", back_populates="follow_ups")


class Answer(Base, TimestampMixin):
    __tablename__ = "answers"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    question_id = Column(String(36), ForeignKey("questions.id", ondelete="CASCADE"), unique=True, nullable=False)
    session_id = Column(String(36), ForeignKey("interview_sessions.id", ondelete="CASCADE"), nullable=False)

    # Content
    answer_text = Column(Text, nullable=False)
    code_snippet = Column(Text, nullable=True)
    language = Column(String(50), nullable=True)  # for coding answers

    # Timing
    time_taken_seconds = Column(Integer, default=0)

    # Evaluation
    score = Column(Float, nullable=True)         # 0–100
    technical_score = Column(Float, nullable=True)
    communication_score = Column(Float, nullable=True)
    confidence_score = Column(Float, nullable=True)
    code_quality_score = Column(Float, nullable=True)
    feedback = Column(Text, nullable=True)
    strengths = Column(JSON, nullable=True)       # list[str]
    improvements = Column(JSON, nullable=True)    # list[str]
    time_complexity = Column(String(50), nullable=True)
    space_complexity = Column(String(50), nullable=True)
    test_cases_passed = Column(Integer, nullable=True)
    test_cases_total = Column(Integer, nullable=True)

    question = relationship("Question", back_populates="answer")


# ─────────────────────────────────────────────────────────────────────────────
# Reports
# ─────────────────────────────────────────────────────────────────────────────

class Report(Base, TimestampMixin):
    __tablename__ = "reports"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    session_id = Column(String(36), ForeignKey("interview_sessions.id", ondelete="CASCADE"), unique=True, nullable=False)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)

    # Report content
    executive_summary = Column(Text, nullable=True)
    strengths = Column(JSON, nullable=True)
    weaknesses = Column(JSON, nullable=True)
    improvement_areas = Column(JSON, nullable=True)
    recommended_topics = Column(JSON, nullable=True)
    learning_roadmap = Column(JSON, nullable=True)
    interview_readiness = Column(String(50), nullable=True)  # ready|almost_ready|needs_work|not_ready

    # Score breakdown
    score_breakdown = Column(JSON, nullable=True)

    # Files
    pdf_path = Column(String(512), nullable=True)
    pdf_generated_at = Column(DateTime(timezone=True), nullable=True)

    # Status
    status = Column(
        String(50),
        default="pending"
    )

    session = relationship("InterviewSession", back_populates="report")


# ─────────────────────────────────────────────────────────────────────────────
# Achievements & Progress
# ─────────────────────────────────────────────────────────────────────────────

class Achievement(Base, TimestampMixin):
    __tablename__ = "achievements"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    achievement_type = Column(String(100), nullable=False)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    icon = Column(String(50), nullable=True)
    earned_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="achievements")


class UserProgress(Base, TimestampMixin):
    __tablename__ = "user_progress"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    week_start = Column(DateTime(timezone=True), nullable=False)
    sessions_completed = Column(Integer, default=0)
    average_score = Column(Float, nullable=True)
    total_practice_minutes = Column(Integer, default=0)
    skills_improved = Column(JSON, nullable=True)
    skills_to_work_on = Column(JSON, nullable=True)

    user = relationship("User", back_populates="progress")
