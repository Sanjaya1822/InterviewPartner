"""
Main API v1 router that includes all sub-routers.
"""
from fastapi import APIRouter
from app.api.v1 import auth, resumes, interviews, analytics

api_router = APIRouter(prefix="/api/v1")

api_router.include_router(auth.router)
api_router.include_router(resumes.router)
api_router.include_router(interviews.router)
api_router.include_router(analytics.router)
