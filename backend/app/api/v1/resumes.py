"""
Resume upload and management endpoints.
"""
import hashlib
import logging
import os
import uuid
from pathlib import Path
from typing import List

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, BackgroundTasks, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.config import settings
from app.core.dependencies import get_current_user
from app.db.base import get_db
from app.db.models import Resume, User
from app.schemas.resume import ResumeUploadResponse, ResumeDetail, ResumeListItem
from app.services.resume_service import (
    parse_resume_file, extract_structured_data,
    generate_skill_summary, analyze_missing_skills, store_resume_embedding,
    _validate_pdf_magic_bytes, _validate_docx_magic_bytes, _compute_file_hash,
)

router = APIRouter(prefix="/resumes", tags=["Resumes"])
logger = logging.getLogger(__name__)

ALLOWED_MIME_TYPES = {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/msword",
}


@router.post("/upload", response_model=ResumeUploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_resume(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Upload a resume (PDF or DOCX). Processing happens asynchronously."""
    # Validate extension
    ext = Path(file.filename).suffix.lower() if file.filename else ""
    if ext not in (".pdf", ".docx", ".doc"):
        raise HTTPException(
            status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            "Only PDF and DOCX files are supported",
        )

    # Read file contents
    contents = await file.read()

    # Validate file size
    if len(contents) > settings.MAX_FILE_SIZE:
        raise HTTPException(
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            f"File too large. Max size: {settings.MAX_FILE_SIZE // 1024 // 1024}MB",
        )

    # ── Magic-byte validation ──────────────────────────────────────────────────
    if ext == ".pdf" and not _validate_pdf_magic_bytes(contents):
        raise HTTPException(
            status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            "File does not appear to be a valid PDF",
        )
    if ext in (".docx", ".doc") and not _validate_docx_magic_bytes(contents):
        raise HTTPException(
            status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            "File does not appear to be a valid DOCX",
        )

    # ── Duplicate detection ────────────────────────────────────────────────────
    file_hash = _compute_file_hash(contents)
    all_resumes = await db.execute(
        select(Resume).where(Resume.user_id == str(current_user.id))
    )
    for existing in all_resumes.scalars().all():
        if existing.file_path and f"_{file_hash[:16]}" in existing.file_path:
            if existing.status in ("ready", "processing"):
                return ResumeUploadResponse(
                    id=str(existing.id),
                    filename=existing.filename,
                    file_size=existing.file_size,
                    status=existing.status,
                    message="This resume was already uploaded. Using existing version.",
                )

    # Determine MIME type
    if ext == ".pdf":
        mime_type = "application/pdf"
    else:
        mime_type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"

    # Save file — embed hash prefix in filename for duplicate lookup
    upload_dir = Path(settings.UPLOAD_DIR) / str(current_user.id)
    upload_dir.mkdir(parents=True, exist_ok=True)
    file_id = str(uuid.uuid4())
    safe_filename = f"{file_id}_{file_hash[:16]}{ext}"
    file_path = upload_dir / safe_filename

    with open(file_path, "wb") as f:
        f.write(contents)

    # Create DB record
    resume = Resume(
        user_id=str(current_user.id),
        filename=file.filename or safe_filename,
        file_path=str(file_path),
        file_size=len(contents),
        mime_type=mime_type,
        status="pending",
    )
    db.add(resume)
    await db.flush()
    resume_id = str(resume.id)

    # Process in background
    background_tasks.add_task(
        _process_resume_background,
        resume_id=resume_id,
        file_path=str(file_path),
        mime_type=mime_type,
        user_id=str(current_user.id),
        job_role=None,
    )

    return ResumeUploadResponse(
        id=resume_id,
        filename=file.filename or safe_filename,
        file_size=len(contents),
        status="pending",
        message="Resume uploaded successfully. Processing in background.",
    )


@router.get("/status/{resume_id}")
async def get_resume_status(
    resume_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Poll resume processing status. Frontend uses this for progress indication."""
    result = await db.execute(
        select(Resume).where(
            Resume.id == resume_id,
            Resume.user_id == str(current_user.id),
        )
    )
    resume = result.scalar_one_or_none()
    if not resume:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Resume not found")

    # More granular progress based on what data is available
    if resume.status == "ready":
        progress = 100
    elif resume.status == "processing":
        if resume.skill_summary:
            progress = 90
        elif resume.parsed_data:
            progress = 75
        elif resume.raw_text:
            progress = 50
        else:
            progress = 25
    elif resume.status == "error":
        progress = 0
    else:  # pending
        progress = 10

    return {
        "id": str(resume.id),
        "status": resume.status,
        "progress": progress,
        "error": resume.parse_error,
        "skill_summary": resume.skill_summary if resume.status == "ready" else None,
        "has_parsed_data": resume.parsed_data is not None,
    }



@router.get("/", response_model=List[ResumeListItem])
async def list_resumes(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all resumes for the current user."""
    result = await db.execute(
        select(Resume)
        .where(Resume.user_id == str(current_user.id))
        .order_by(Resume.created_at.desc())
    )
    resumes = result.scalars().all()
    return [
        ResumeListItem(
            id=str(r.id),
            filename=r.filename,
            file_size=r.file_size,
            status=r.status,
            created_at=r.created_at.isoformat() if r.created_at else "",
        )
        for r in resumes
    ]


@router.get("/{resume_id}", response_model=ResumeDetail)
async def get_resume(
    resume_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get details of a specific resume."""
    result = await db.execute(
        select(Resume).where(
            Resume.id == resume_id,
            Resume.user_id == str(current_user.id),
        )
    )
    resume = result.scalar_one_or_none()
    if not resume:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Resume not found")

    return ResumeDetail(
        id=str(resume.id),
        user_id=str(resume.user_id),
        filename=resume.filename,
        file_size=resume.file_size,
        status=resume.status,
        parsed_data=resume.parsed_data,
        skill_summary=resume.skill_summary,
        missing_skills=resume.missing_skills,
        created_at=resume.created_at.isoformat() if resume.created_at else "",
        updated_at=resume.updated_at.isoformat() if resume.updated_at else "",
    )


@router.delete("/{resume_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_resume(
    resume_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a resume."""
    result = await db.execute(
        select(Resume).where(
            Resume.id == resume_id,
            Resume.user_id == str(current_user.id),
        )
    )
    resume = result.scalar_one_or_none()
    if not resume:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Resume not found")

    # Delete file
    try:
        os.remove(resume.file_path)
    except OSError:
        pass

    await db.delete(resume)


# ─────────────────────────────────────────────────────────────────────────────
# Background processing
# ─────────────────────────────────────────────────────────────────────────────

async def _process_resume_background(
    resume_id: str,
    file_path: str,
    mime_type: str,
    user_id: str,
    job_role: str | None,
) -> None:
    """Parse resume and extract structured data. LLM calls are run concurrently."""
    import asyncio
    from app.db.base import AsyncSessionLocal

    async with AsyncSessionLocal() as db:
        try:
            # Brief retry loop: background task can start before the request session commits
            resume = None
            for attempt in range(5):
                result = await db.execute(select(Resume).where(Resume.id == resume_id))
                resume = result.scalar_one_or_none()
                if resume:
                    break
                await asyncio.sleep(0.3 * (attempt + 1))  # 0.3s, 0.6s, 0.9s, 1.2s, 1.5s

            if not resume:
                logger.error("Resume %s not found after retries — skipping background processing", resume_id)
                return

            resume.status = "processing"
            await db.flush()

            # ── Step 1: Parse raw text (fast — runs in thread pool) ────────────
            raw_text = await parse_resume_file(file_path, mime_type)
            resume.raw_text = raw_text
            await db.flush()

            # ── Step 2: LLM calls concurrently ────────────────────────────────
            # Run extract_structured_data and (optionally) analyze_missing_skills
            # concurrently to halve total LLM latency
            tasks = [extract_structured_data(raw_text)]
            if job_role:
                # We can't run analyze_missing_skills yet — needs parsed_data
                pass  # will run after extract below

            results = await asyncio.gather(*tasks, return_exceptions=True)
            parsed_data = results[0] if not isinstance(results[0], Exception) else {}
            if isinstance(results[0], Exception):
                logger.warning("extract_structured_data failed: %s — using basic extraction", results[0])
                from app.services.resume_service import _basic_extraction
                parsed_data = _basic_extraction(raw_text)

            resume.parsed_data = parsed_data

            # ── Step 3: Skill summary (concurrently with missing skills) ───────
            summary_task = generate_skill_summary(parsed_data)
            missing_task = analyze_missing_skills(parsed_data, job_role) if job_role else None

            concurrent_tasks = [summary_task]
            if missing_task:
                concurrent_tasks.append(missing_task)

            concurrent_results = await asyncio.gather(*concurrent_tasks, return_exceptions=True)

            skill_summary = concurrent_results[0] if not isinstance(concurrent_results[0], Exception) else ""
            if isinstance(concurrent_results[0], Exception):
                logger.warning("generate_skill_summary failed: %s", concurrent_results[0])
                skill_summary = "Resume processed successfully."

            resume.skill_summary = skill_summary

            if missing_task and len(concurrent_results) > 1:
                missing = concurrent_results[1] if not isinstance(concurrent_results[1], Exception) else []
                resume.missing_skills = missing

            # ── Step 4: ChromaDB embedding (non-critical, fire and forget) ─────
            chroma_id = await store_resume_embedding(
                resume_id=resume_id,
                text=raw_text,
                metadata={"user_id": user_id, "filename": resume.filename},
            )
            resume.chroma_doc_id = chroma_id
            resume.status = "ready"
            await db.commit()
            logger.info("Resume %s processed successfully", resume_id)

        except Exception as e:
            logger.error("Resume processing failed for %s: %s", resume_id, e, exc_info=True)
            try:
                # Fresh query to update status — original object might be stale
                result = await db.execute(select(Resume).where(Resume.id == resume_id))
                resume = result.scalar_one_or_none()
                if resume:
                    resume.status = "error"
                    resume.parse_error = str(e)
                    await db.commit()
            except Exception as inner_e:
                logger.error("Failed to update resume error status: %s", inner_e)
