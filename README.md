# AI Interview Practice Partner 🎯

A production-ready AI-powered interview preparation platform that helps candidates practice technical and behavioral interviews with real-time feedback, personalized question generation, and comprehensive performance analytics.

---

## Table of Contents

- [Overview](#overview)
- [Tech Stack](#tech-stack)
- [Architecture Overview](#architecture-overview)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Docker Setup (Recommended)](#docker-setup-recommended)
  - [Manual Setup](#manual-setup)
- [Environment Variables](#environment-variables)
- [API Documentation](#api-documentation)
- [Deployment](#deployment)
  - [Frontend — Vercel](#frontend--vercel)
  - [Backend — Railway](#backend--railway)
- [Contributing](#contributing)
- [License](#license)

---

## Overview

AI Interview Practice Partner provides:

- **Personalized interview sessions** driven by LLM-based question generation (Groq / Gemini / OpenRouter)
- **Resume parsing** to tailor questions to a candidate's background
- **Real-time AI feedback** on answers with scoring and improvement tips
- **Code interview support** with an in-browser Monaco editor
- **Performance analytics** and progress tracking over time
- **PDF report generation** for each completed session
- **WebSocket-powered** live interviewer experience

---

## Tech Stack

### Frontend
| Technology | Purpose |
|---|---|
| React 18 + Vite | UI framework and build tool |
| TypeScript | Type safety |
| Tailwind CSS | Utility-first styling |
| Radix UI | Accessible component primitives |
| TanStack Query | Server state management |
| Zustand | Client state management |
| Framer Motion | Animations |
| Monaco Editor | In-browser code editor |
| Socket.IO Client | Real-time communication |
| React Hook Form + Zod | Form handling and validation |
| Recharts | Analytics charts |
| jsPDF | PDF report generation |

### Backend
| Technology | Purpose |
|---|---|
| FastAPI | Async REST API framework |
| LangGraph + LangChain | AI agent orchestration |
| Groq / Gemini / OpenRouter | LLM providers |
| ChromaDB | Vector store for RAG |
| PostgreSQL 15 | Primary database |
| SQLAlchemy + Alembic | ORM and migrations |
| Redis + Celery | Task queue and caching |
| WebSockets | Real-time interview streaming |
| PyMuPDF + python-docx | Resume parsing |
| Sentence Transformers | Local embeddings |
| ReportLab | PDF generation |
| Passlib + python-jose | Auth (JWT + bcrypt) |

### Infrastructure
| Technology | Purpose |
|---|---|
| Docker + Docker Compose | Local development |
| PostgreSQL 15 | Relational data |
| ChromaDB | Vector embeddings |
| Redis | Cache + Celery broker |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                        Frontend                         │
│              React + Vite (port 5173)                   │
└──────────────────────┬──────────────────────────────────┘
                       │ HTTP / WebSocket
┌──────────────────────▼──────────────────────────────────┐
│                    FastAPI Backend                       │
│                     (port 8000)                         │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │  Auth/Users │  │  Interview   │  │  Analytics    │  │
│  │   Router    │  │   Router     │  │   Router      │  │
│  └─────────────┘  └──────┬───────┘  └───────────────┘  │
│                          │                              │
│  ┌───────────────────────▼─────────────────────────┐   │
│  │           LangGraph Agent Orchestrator           │   │
│  │  (Question Gen → Evaluation → Feedback Loop)    │   │
│  └───────────────────────┬─────────────────────────┘   │
└──────────────────────────┼──────────────────────────────┘
                           │
         ┌─────────────────┼─────────────────┐
         │                 │                 │
┌────────▼──────┐  ┌───────▼──────┐  ┌──────▼──────┐
│  PostgreSQL   │  │   ChromaDB   │  │    Redis    │
│  (port 5432)  │  │  (port 8001) │  │  (port 6379)│
└───────────────┘  └──────────────┘  └─────────────┘
```

### Key Data Flows

1. **Resume Upload** → PyMuPDF/python-docx parsing → Sentence Transformer embeddings → ChromaDB storage
2. **Interview Start** → LangGraph agent reads resume context → generates tailored questions
3. **Answer Submission** → LLM evaluates answer → scores stored in PostgreSQL → feedback streamed via WebSocket
4. **Report Generation** → Celery background task → ReportLab PDF → stored and served

---

## Getting Started

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and [Docker Compose](https://docs.docker.com/compose/install/) (v2+)
- [Node.js](https://nodejs.org/) 18+ (for manual frontend setup)
- [Python](https://www.python.org/) 3.11+ (for manual backend setup)
- A [Groq API key](https://console.groq.com/) (free tier available)

---

### Docker Setup (Recommended)

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-org/ai-interview-partner.git
   cd ai-interview-partner
   ```

2. **Configure environment variables**
   ```bash
   cp backend/.env.example backend/.env
   cp frontend/.env.example frontend/.env
   ```
   Edit `backend/.env` and add your API keys (at minimum `GROQ_API_KEY`).

3. **Start all services**
   ```bash
   docker compose up --build
   ```

4. **Access the application**
   - Frontend: http://localhost:5173
   - Backend API: http://localhost:8000
   - API Docs (Swagger): http://localhost:8000/docs
   - API Docs (ReDoc): http://localhost:8000/redoc

5. **Run database migrations** (first time only)
   ```bash
   docker compose exec backend alembic upgrade head
   ```

---

### Manual Setup

#### Backend

```bash
cd backend

# Create and activate virtual environment
python -m venv venv
source venv/bin/activate        # Linux/macOS
# venv\Scripts\activate         # Windows

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env with your values

# Start PostgreSQL and Redis (via Docker or locally)
docker compose up postgres redis chromadb -d

# Run migrations
alembic upgrade head

# Start the development server
uvicorn app.main:app --reload --port 8000
```

#### Frontend

```bash
cd frontend

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env if needed

# Start the development server
npm run dev
```

---

## Environment Variables

### Backend (`backend/.env`)

| Variable | Description | Default |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:password@localhost:5432/interview_db` |
| `SECRET_KEY` | JWT signing key — **use a strong random value in production** | — |
| `ALGORITHM` | JWT algorithm | `HS256` |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | JWT expiry | `30` |
| `GROQ_API_KEY` | Groq LLM API key | — |
| `GEMINI_API_KEY` | Google Gemini API key (optional) | — |
| `OPENROUTER_API_KEY` | OpenRouter API key (optional) | — |
| `CHROMA_HOST` | ChromaDB host | `localhost` |
| `CHROMA_PORT` | ChromaDB port | `8001` |
| `REDIS_URL` | Redis connection URL | `redis://localhost:6379` |
| `GOOGLE_CLIENT_ID` | Google OAuth2 client ID | — |
| `GOOGLE_CLIENT_SECRET` | Google OAuth2 client secret | — |
| `FRONTEND_URL` | Allowed CORS origin | `http://localhost:5173` |
| `MAX_FILE_SIZE` | Max resume upload size (bytes) | `10485760` (10 MB) |
| `ALLOWED_EXTENSIONS` | Permitted upload types | `pdf,docx` |

### Frontend (`frontend/.env`)

| Variable | Description | Default |
|---|---|---|
| `VITE_API_URL` | Backend API base URL | `http://localhost:8000` |
| `VITE_WS_URL` | WebSocket URL | `ws://localhost:8000` |
| `VITE_GOOGLE_CLIENT_ID` | Google OAuth2 client ID | — |

---

## API Documentation

Interactive API docs are auto-generated by FastAPI:

- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc
- **OpenAPI JSON**: http://localhost:8000/openapi.json

### Key Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/v1/auth/register` | Register new user |
| `POST` | `/api/v1/auth/login` | Login, receive JWT |
| `POST` | `/api/v1/auth/google` | Google OAuth2 login |
| `POST` | `/api/v1/resumes/upload` | Upload resume (PDF/DOCX) |
| `GET` | `/api/v1/resumes/` | List user resumes |
| `POST` | `/api/v1/interviews/start` | Start interview session |
| `POST` | `/api/v1/interviews/{id}/answer` | Submit answer |
| `GET` | `/api/v1/interviews/{id}/feedback` | Get session feedback |
| `GET` | `/api/v1/analytics/dashboard` | Performance dashboard data |
| `GET` | `/api/v1/reports/{id}` | Download PDF report |
| `WS` | `/ws/interview/{session_id}` | Real-time interview WebSocket |

---

## Deployment

### Frontend — Vercel

1. Push your repository to GitHub.
2. Import the project at [vercel.com/new](https://vercel.com/new).
3. Set the **Root Directory** to `frontend`.
4. Vercel auto-detects Vite — confirm build command `npm run build` and output `dist`.
5. Add environment variables in the Vercel dashboard:
   - `VITE_API_URL` → your Railway backend URL
   - `VITE_WS_URL` → your Railway WebSocket URL
   - `VITE_GOOGLE_CLIENT_ID`
6. Deploy.

### Backend — Railway

1. Create a new project at [railway.app](https://railway.app).
2. Add a **GitHub** service pointing to your repo, root directory `backend`.
3. Add a **PostgreSQL** plugin and a **Redis** plugin.
4. Add a **ChromaDB** service using the `chromadb/chroma` Docker image.
5. Set all required environment variables (see table above) using Railway's variable manager.
6. Railway will detect `requirements.txt` and deploy automatically.
7. Add a custom start command:
   ```
   alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port $PORT
   ```

---

## Contributing

1. Fork the repository.
2. Create a feature branch: `git checkout -b feature/your-feature-name`.
3. Commit your changes: `git commit -m "feat: add your feature"`.
4. Push the branch: `git push origin feature/your-feature-name`.
5. Open a Pull Request.

Please follow [Conventional Commits](https://www.conventionalcommits.org/) and ensure all tests pass before submitting.

---

## License

MIT License. See [LICENSE](LICENSE) for details.
