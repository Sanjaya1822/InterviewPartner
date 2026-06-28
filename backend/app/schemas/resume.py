from typing import Optional, List, Any
from pydantic import BaseModel


class ResumeUploadResponse(BaseModel):
    id: str
    filename: str
    file_size: int
    status: str
    message: str


class ParsedEducation(BaseModel):
    institution: str
    degree: str
    field: Optional[str]
    year: Optional[str]
    gpa: Optional[str]


class ParsedExperience(BaseModel):
    company: str
    role: str
    duration: str
    responsibilities: List[str]
    technologies: List[str]


class ParsedProject(BaseModel):
    name: str
    description: str
    technologies: List[str]
    url: Optional[str]


class ParsedCertification(BaseModel):
    name: str
    issuer: Optional[str]
    year: Optional[str]


class ParsedResumeData(BaseModel):
    name: Optional[str]
    email: Optional[str]
    phone: Optional[str]
    linkedin: Optional[str]
    github: Optional[str]
    skills: List[str]
    technical_skills: List[str]
    soft_skills: List[str]
    education: List[ParsedEducation]
    experience: List[ParsedExperience]
    projects: List[ParsedProject]
    certifications: List[ParsedCertification]
    total_years_experience: Optional[float]
    primary_tech_stack: List[str]


class ResumeDetail(BaseModel):
    id: str
    user_id: str
    filename: str
    file_size: int
    status: str
    parsed_data: Optional[ParsedResumeData]
    skill_summary: Optional[str]
    missing_skills: Optional[List[str]]
    created_at: Any
    updated_at: Any

    model_config = {"from_attributes": True}


class ResumeListItem(BaseModel):
    id: str
    filename: str
    file_size: int
    status: str
    created_at: Any

    model_config = {"from_attributes": True}
