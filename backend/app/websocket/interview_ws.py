"""
WebSocket endpoint for real-time interview streaming.
Provides streaming question text and live feedback.
"""
import json
import logging
from typing import Dict, Optional

from fastapi import WebSocket, WebSocketDisconnect, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.security import verify_access_token
from app.db.base import AsyncSessionLocal
from app.db.models import InterviewSession
from app.services.ai.interview_engine import get_interview_engine
from app.services.ai.llm_provider import stream_with_fallback
from langchain_core.messages import SystemMessage, HumanMessage

logger = logging.getLogger(__name__)


class ConnectionManager:
    """Manages active WebSocket connections."""

    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}

    async def connect(self, session_id: str, websocket: WebSocket):
        await websocket.accept()
        self.active_connections[session_id] = websocket
        logger.info("WS connected: session %s", session_id)

    def disconnect(self, session_id: str):
        self.active_connections.pop(session_id, None)
        logger.info("WS disconnected: session %s", session_id)

    async def send_json(self, session_id: str, data: dict):
        ws = self.active_connections.get(session_id)
        if ws:
            try:
                await ws.send_json(data)
            except Exception as e:
                logger.warning("WS send failed for %s: %s", session_id, e)
                self.disconnect(session_id)

    async def send_text(self, session_id: str, text: str):
        ws = self.active_connections.get(session_id)
        if ws:
            try:
                await ws.send_text(text)
            except Exception as e:
                logger.warning("WS text send failed for %s: %s", session_id, e)
                self.disconnect(session_id)


manager = ConnectionManager()


async def interview_websocket_endpoint(websocket: WebSocket, session_id: str):
    """
    WebSocket endpoint for streaming interview interactions.
    
    Message types sent by server:
    - {type: "connected", session_id: "..."}
    - {type: "question_start"} — indicates question streaming begins
    - {type: "token", content: "word"} — streaming tokens
    - {type: "question_end", question_id: "...", question_number: N, total: N}
    - {type: "feedback_start"}
    - {type: "feedback", score: N, feedback: "...", strengths: [...], improvements: [...]}
    - {type: "session_complete", summary: {...}}
    - {type: "error", message: "..."}
    
    Message types received from client:
    - {type: "auth", token: "JWT"}
    - {type: "answer", content: "...", code: "...", language: "...", time_taken: N}
    - {type: "ping"}
    """
    await manager.connect(session_id, websocket)
    user_id: Optional[str] = None

    try:
        # Wait for auth message
        auth_raw = await websocket.receive_text()
        auth_msg = json.loads(auth_raw)

        if auth_msg.get("type") != "auth":
            await websocket.send_json({"type": "error", "message": "First message must be auth"})
            await websocket.close(code=4001)
            manager.disconnect(session_id)
            return

        token = auth_msg.get("token", "")
        user_id = verify_access_token(token)
        if not user_id:
            await websocket.send_json({"type": "error", "message": "Invalid token"})
            await websocket.close(code=4001)
            manager.disconnect(session_id)
            return

        # Verify session belongs to user
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(InterviewSession).where(
                    InterviewSession.id == session_id,
                    InterviewSession.user_id == user_id,
                )
            )
            session = result.scalar_one_or_none()
            if not session:
                await websocket.send_json({"type": "error", "message": "Session not found"})
                await websocket.close(code=4004)
                manager.disconnect(session_id)
                return

        await websocket.send_json({"type": "connected", "session_id": session_id})

        # Main message loop
        while True:
            raw = await websocket.receive_text()
            msg = json.loads(raw)
            msg_type = msg.get("type")

            if msg_type == "ping":
                await websocket.send_json({"type": "pong"})
                continue

            elif msg_type == "answer":
                await _handle_answer(
                    websocket=websocket,
                    session_id=session_id,
                    user_id=user_id,
                    content=msg.get("content", ""),
                    code=msg.get("code"),
                    language=msg.get("language"),
                    time_taken=msg.get("time_taken", 0),
                )

            elif msg_type == "stream_question":
                # Client requests streaming of a specific question text
                question_text = msg.get("text", "")
                if question_text:
                    await _stream_text(websocket, question_text)

            else:
                await websocket.send_json({
                    "type": "error",
                    "message": f"Unknown message type: {msg_type}",
                })

    except WebSocketDisconnect:
        logger.info("WebSocket disconnected: %s", session_id)
    except json.JSONDecodeError:
        await websocket.send_json({"type": "error", "message": "Invalid JSON"})
    except Exception as e:
        logger.error("WebSocket error for session %s: %s", session_id, e)
        try:
            await websocket.send_json({"type": "error", "message": str(e)})
        except Exception:
            pass
    finally:
        manager.disconnect(session_id)


async def _handle_answer(
    websocket: WebSocket,
    session_id: str,
    user_id: str,
    content: str,
    code: Optional[str],
    language: Optional[str],
    time_taken: int,
):
    """Process answer submission and stream feedback."""
    await websocket.send_json({"type": "processing"})

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(InterviewSession).where(
                InterviewSession.id == session_id,
                InterviewSession.user_id == user_id,
            )
        )
        session = result.scalar_one_or_none()
        if not session:
            await websocket.send_json({"type": "error", "message": "Session not found"})
            return

        engine = get_interview_engine()
        try:
            feedback = await engine.process_answer(
                db=db,
                session=session,
                answer_text=content,
                code_snippet=code,
                language=language,
                time_taken_seconds=time_taken,
            )

            # Send feedback
            await websocket.send_json({
                "type": "feedback",
                "score": feedback.get("score", 0),
                "technical_score": feedback.get("technical_score"),
                "communication_score": feedback.get("communication_score"),
                "confidence_score": feedback.get("confidence_score"),
                "feedback": feedback.get("feedback", ""),
                "strengths": feedback.get("strengths", []),
                "improvements": feedback.get("improvements", []),
                "time_complexity": feedback.get("time_complexity"),
                "space_complexity": feedback.get("space_complexity"),
                "answer_id": feedback.get("answer_id"),
            })

            if feedback.get("session_complete"):
                await websocket.send_json({
                    "type": "session_complete",
                    "session_id": session_id,
                    "message": "Interview completed. Generating report...",
                })
                return

            # Stream next question
            next_q = feedback.get("next_question")
            if next_q:
                await websocket.send_json({
                    "type": "question_start",
                    "question_id": next_q.get("question_id"),
                    "question_number": next_q.get("question_number"),
                    "total_questions": next_q.get("total_questions"),
                    "question_type": next_q.get("question_type"),
                    "category": next_q.get("category"),
                    "is_follow_up": next_q.get("is_follow_up", False),
                    "is_last_question": next_q.get("is_last_question", False),
                })

                # Stream question text token by token
                await _stream_text(websocket, next_q.get("question_text", ""))

                await websocket.send_json({
                    "type": "question_end",
                    "question_id": next_q.get("question_id"),
                })

        except Exception as e:
            logger.error("WS answer processing error: %s", e)
            await websocket.send_json({
                "type": "error",
                "message": f"Processing failed: {str(e)}",
            })


async def _stream_text(websocket: WebSocket, text: str):
    """Stream text as individual word tokens for typing effect."""
    import asyncio
    words = text.split()
    for i, word in enumerate(words):
        token = word + (" " if i < len(words) - 1 else "")
        await websocket.send_json({"type": "token", "content": token})
        # Small delay for natural typing effect
        await asyncio.sleep(0.03)
