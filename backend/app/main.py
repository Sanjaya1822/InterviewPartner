"""
FastAPI application entry point.
"""
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app.core.config import settings

logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL, logging.INFO),
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan — startup and shutdown events."""
    logger.info("Starting AI Interview Partner API v%s", settings.APP_VERSION)

    # Create upload/report directories
    Path(settings.UPLOAD_DIR).mkdir(parents=True, exist_ok=True)
    Path(settings.REPORTS_DIR).mkdir(parents=True, exist_ok=True)

    # Pre-warm the LangGraph (compiles the graph)
    try:
        from app.services.ai.graph import get_interview_graph
        get_interview_graph()
        logger.info("LangGraph interview graph compiled")
    except Exception as e:
        logger.warning("LangGraph pre-warm failed: %s", e)

    yield

    logger.info("Shutting down AI Interview Partner API")


app = FastAPI(
    title="AI Interview Practice Partner",
    description="Production-ready AI-powered interview preparation platform with multi-agent orchestration",
    version=settings.APP_VERSION,
    docs_url="/docs" if settings.DEBUG else None,
    redoc_url="/redoc" if settings.DEBUG else None,
    lifespan=lifespan,
)

# ─────────────────────────────────────────────────────────────────────────────
# Middleware
# ─────────────────────────────────────────────────────────────────────────────

app.add_middleware(GZipMiddleware, minimum_size=1000)

# CORS
allowed_origins = [settings.FRONTEND_URL]
if settings.DEBUG:
    allowed_origins += ["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:3000"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─────────────────────────────────────────────────────────────────────────────
# Rate limiting
# ─────────────────────────────────────────────────────────────────────────────
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# ─────────────────────────────────────────────────────────────────────────────
# Routers
# ─────────────────────────────────────────────────────────────────────────────
from app.api.v1.router import api_router
from app.websocket.interview_ws import interview_websocket_endpoint

app.include_router(api_router)

# WebSocket endpoint
from fastapi import WebSocket
@app.websocket("/ws/interview/{session_id}")
async def websocket_interview(websocket: WebSocket, session_id: str):
    await interview_websocket_endpoint(websocket, session_id)

# ─────────────────────────────────────────────────────────────────────────────
# Health & info endpoints
# ─────────────────────────────────────────────────────────────────────────────

@app.get("/health", tags=["System"])
async def health_check():
    """Health check endpoint."""
    from datetime import datetime, timezone
    health = {
        "status": "healthy",
        "version": settings.APP_VERSION,
        "environment": settings.APP_ENV,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "services": {},
    }

    # Check database
    try:
        from app.db.base import async_engine
        async with async_engine.connect() as conn:
            await conn.execute(__import__("sqlalchemy").text("SELECT 1"))
        health["services"]["database"] = "ok"
    except Exception as e:
        health["services"]["database"] = f"error: {e}"
        health["status"] = "degraded"

    # Check ChromaDB
    try:
        import chromadb
        client = chromadb.HttpClient(host=settings.CHROMA_HOST, port=settings.CHROMA_PORT)
        client.heartbeat()
        health["services"]["chromadb"] = "ok"
    except Exception:
        health["services"]["chromadb"] = "unavailable"

    # Check LLM
    llm_status = "configured" if (settings.GROQ_API_KEY or settings.GEMINI_API_KEY) else "no_api_key"
    health["services"]["llm"] = llm_status

    return health


@app.get("/", tags=["System"])
async def root():
    return {
        "name": "AI Interview Practice Partner API",
        "version": settings.APP_VERSION,
        "docs": "/docs",
        "health": "/health",
    }


# ─────────────────────────────────────────────────────────────────────────────
# Global exception handlers
# ─────────────────────────────────────────────────────────────────────────────

@app.exception_handler(404)
async def not_found_handler(request: Request, exc):
    return JSONResponse(
        status_code=404,
        content={"detail": "Resource not found"},
    )


@app.exception_handler(500)
async def internal_error_handler(request: Request, exc: Exception):
    logger.error("Unhandled exception: %s", exc)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
    )
