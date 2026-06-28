# Architecture Overview

See the main [README.md](../README.md#architecture-overview) for the high-level architecture diagram.

## Directory Structure

```
ai-interview-partner/
├── frontend/                    # React + Vite + TypeScript SPA
│   ├── src/
│   │   ├── components/          # Reusable UI components
│   │   │   ├── ui/              # shadcn/ui primitives
│   │   │   ├── interview/       # Interview session components
│   │   │   ├── dashboard/       # Analytics dashboard components
│   │   │   └── layout/          # Layout shell (Header, Sidebar, etc.)
│   │   ├── pages/               # Route-level page components
│   │   ├── hooks/               # Custom React hooks
│   │   ├── stores/              # Zustand state stores
│   │   ├── services/            # Axios API client modules
│   │   ├── types/               # Shared TypeScript types
│   │   ├── lib/                 # Utility functions (cn, formatters, etc.)
│   │   └── main.tsx             # App entry point
│   ├── public/                  # Static assets
│   └── ...config files
│
├── backend/                     # FastAPI + Python
│   ├── app/
│   │   ├── api/
│   │   │   └── v1/
│   │   │       ├── auth.py      # JWT + Google OAuth2 routes
│   │   │       ├── resumes.py   # Resume upload & management
│   │   │       ├── interviews.py# Interview session routes
│   │   │       ├── analytics.py # Performance analytics routes
│   │   │       └── reports.py   # PDF report download routes
│   │   ├── core/
│   │   │   ├── config.py        # Pydantic Settings
│   │   │   ├── security.py      # JWT helpers, password hashing
│   │   │   └── dependencies.py  # FastAPI dependencies (get_db, get_user)
│   │   ├── db/
│   │   │   ├── base.py          # SQLAlchemy Base
│   │   │   ├── session.py       # Async session factory
│   │   │   └── models/          # SQLAlchemy ORM models
│   │   ├── schemas/             # Pydantic request/response schemas
│   │   ├── services/
│   │   │   ├── ai/              # LangGraph agents & chains
│   │   │   ├── resume.py        # Resume parsing service
│   │   │   ├── vector_store.py  # ChromaDB client wrapper
│   │   │   └── report.py        # ReportLab PDF generation
│   │   ├── worker/
│   │   │   ├── celery_app.py    # Celery app configuration
│   │   │   └── tasks.py         # Background tasks
│   │   ├── websocket/
│   │   │   └── interview.py     # WebSocket endpoint handler
│   │   └── main.py              # FastAPI app factory
│   ├── alembic/                 # Database migrations
│   ├── tests/                   # Pytest test suite
│   └── ...config files
│
├── docker/                      # Additional Docker configs & scripts
├── docs/                        # Project documentation
└── docker-compose.yml
```

## LangGraph Agent Design

The interview agent uses a stateful graph with the following nodes:

```
[START]
  │
  ▼
[load_context]         — Retrieve resume embeddings from ChromaDB
  │
  ▼
[generate_question]    — Produce next question based on context + history
  │
  ▼
[stream_question]      — Stream question text to frontend via WebSocket
  │
  ▼
[receive_answer]       — Wait for candidate's answer
  │
  ▼
[evaluate_answer]      — Score and critique the answer (LLM call)
  │
  ▼
[store_result]         — Persist score + feedback to PostgreSQL
  │
  ▼
[should_continue?]     — Branch: more questions vs end session
  │                ╲
  ▼                 ▼
[loop back]       [generate_summary]
                    │
                    ▼
                  [END]
```
