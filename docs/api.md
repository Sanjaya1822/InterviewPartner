# API Reference

The FastAPI backend auto-generates interactive documentation at runtime:

- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

This file provides a quick reference for the main endpoints.

---

## Authentication

### `POST /api/v1/auth/register`
Register a new user account.

**Body:**
```json
{
  "email": "user@example.com",
  "password": "StrongPassword123!",
  "full_name": "Jane Doe"
}
```

**Response:** `201 Created` — user object + access token.

---

### `POST /api/v1/auth/login`
Login with email + password.

**Body (form-encoded):**
```
username=user@example.com&password=StrongPassword123!
```

**Response:** `200 OK`
```json
{
  "access_token": "eyJ...",
  "token_type": "bearer",
  "expires_in": 1800
}
```

---

### `POST /api/v1/auth/google`
Google OAuth2 login — exchange a Google ID token for a local JWT.

---

## Resumes

### `POST /api/v1/resumes/upload`
Upload a PDF or DOCX resume. Triggers async parsing and embedding.

**Content-Type:** `multipart/form-data`
**Field:** `file` (PDF or DOCX, max 10 MB)

---

### `GET /api/v1/resumes/`
List all resumes for the authenticated user.

---

### `DELETE /api/v1/resumes/{resume_id}`
Delete a resume and its associated embeddings.

---

## Interviews

### `POST /api/v1/interviews/start`
Start a new interview session.

**Body:**
```json
{
  "resume_id": "uuid",
  "interview_type": "technical",
  "difficulty": "medium",
  "duration_minutes": 45,
  "focus_areas": ["algorithms", "system design"]
}
```

---

### `POST /api/v1/interviews/{session_id}/answer`
Submit an answer to the current question.

**Body:**
```json
{
  "answer_text": "My answer...",
  "code_snippet": "def solution():\n    pass",
  "time_taken_seconds": 120
}
```

---

### `GET /api/v1/interviews/{session_id}`
Get session details including all Q&A pairs and scores.

---

### `POST /api/v1/interviews/{session_id}/end`
Manually end a session and trigger summary generation.

---

## Analytics

### `GET /api/v1/analytics/dashboard`
Returns aggregated performance metrics for the authenticated user.

---

### `GET /api/v1/analytics/sessions`
Paginated list of past interview sessions with scores.

---

## Reports

### `GET /api/v1/reports/{session_id}`
Download the PDF report for a completed session.

---

## WebSocket

### `WS /ws/interview/{session_id}`
Real-time bi-directional channel for live interview sessions.

**Client → Server messages:**
```json
{ "type": "answer", "content": "...", "code": "..." }
{ "type": "ping" }
```

**Server → Client messages:**
```json
{ "type": "question", "content": "...", "question_number": 1 }
{ "type": "feedback", "score": 8, "critique": "..." }
{ "type": "session_end", "summary": { ... } }
{ "type": "pong" }
```
