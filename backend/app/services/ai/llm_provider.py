"""
LLM provider with automatic fallback chain:
  Groq → Gemini → OpenRouter → raises error
"""
import logging
from typing import Optional, AsyncIterator
from langchain_core.language_models import BaseChatModel
from langchain_core.messages import BaseMessage, HumanMessage, SystemMessage

from app.core.config import settings

logger = logging.getLogger(__name__)


def get_groq_llm(model: Optional[str] = None, streaming: bool = False) -> BaseChatModel:
    from langchain_groq import ChatGroq
    return ChatGroq(
        groq_api_key=settings.GROQ_API_KEY,
        model_name=model or settings.DEFAULT_LLM_MODEL,
        temperature=0.7,
        streaming=streaming,
        max_tokens=4096,
    )


def get_gemini_llm(streaming: bool = False) -> BaseChatModel:
    from langchain_google_genai import ChatGoogleGenerativeAI
    return ChatGoogleGenerativeAI(
        google_api_key=settings.GEMINI_API_KEY,
        model="gemini-2.5-flash",
        temperature=0.7,
        streaming=streaming,
    )


def get_openrouter_llm(streaming: bool = False) -> BaseChatModel:
    from langchain_openai import ChatOpenAI
    return ChatOpenAI(
        api_key=settings.OPENROUTER_API_KEY,
        base_url="https://openrouter.ai/api/v1",
        model="mistralai/mistral-7b-instruct",
        temperature=0.7,
        streaming=streaming,
    )


def get_llm(streaming: bool = False, model: Optional[str] = None) -> BaseChatModel:
    """Return an LLM using the configured provider, with fallback chain."""
    errors = []

    if settings.GROQ_API_KEY:
        try:
            return get_groq_llm(model=model, streaming=streaming)
        except Exception as e:
            errors.append(f"Groq: {e}")
            logger.warning("Groq LLM init failed: %s", e)

    if settings.GEMINI_API_KEY:
        try:
            return get_gemini_llm(streaming=streaming)
        except Exception as e:
            errors.append(f"Gemini: {e}")
            logger.warning("Gemini LLM init failed: %s", e)

    if settings.OPENROUTER_API_KEY:
        try:
            return get_openrouter_llm(streaming=streaming)
        except Exception as e:
            errors.append(f"OpenRouter: {e}")
            logger.warning("OpenRouter LLM init failed: %s", e)

    raise RuntimeError(
        f"No LLM provider available. Tried: {'; '.join(errors)}. "
        "Please set GROQ_API_KEY, GEMINI_API_KEY, or OPENROUTER_API_KEY in .env"
    )


async def invoke_with_fallback(messages: list[BaseMessage], streaming: bool = False) -> str:
    """
    Invoke the LLM with fallback. Returns full response text.
    Tries each provider before raising.
    """
    providers = []

    available = {}
    if settings.GROQ_API_KEY:
        available["groq"] = lambda: get_groq_llm(streaming=False)
    if settings.GEMINI_API_KEY:
        available["gemini"] = lambda: get_gemini_llm(streaming=False)
    if settings.OPENROUTER_API_KEY:
        available["openrouter"] = lambda: get_openrouter_llm(streaming=False)

    if settings.DEFAULT_LLM_PROVIDER in available:
        providers.append((settings.DEFAULT_LLM_PROVIDER, available.pop(settings.DEFAULT_LLM_PROVIDER)))
    
    for k, v in available.items():
        providers.append((k, v))

    if not providers:
        raise RuntimeError("No LLM provider configured. Please set at least one API key.")

    last_error = None
    for name, factory in providers:
        try:
            llm = factory()
            response = await llm.ainvoke(messages)
            return response.content
        except Exception as e:
            last_error = e
            logger.warning("Provider %s failed: %s — trying next", name, e)

    raise RuntimeError(f"All LLM providers failed. Last error: {last_error}")


async def stream_with_fallback(messages: list[BaseMessage]) -> AsyncIterator[str]:
    """Stream tokens from the LLM with fallback."""
    providers = []

    available = {}
    if settings.GROQ_API_KEY:
        available["groq"] = lambda: get_groq_llm(streaming=True)
    if settings.GEMINI_API_KEY:
        available["gemini"] = lambda: get_gemini_llm(streaming=True)
    if settings.OPENROUTER_API_KEY:
        available["openrouter"] = lambda: get_openrouter_llm(streaming=True)

    if settings.DEFAULT_LLM_PROVIDER in available:
        providers.append((settings.DEFAULT_LLM_PROVIDER, available.pop(settings.DEFAULT_LLM_PROVIDER)))
    
    for k, v in available.items():
        providers.append((k, v))

    if not providers:
        raise RuntimeError("No LLM provider configured.")

    last_error = None
    for name, factory in providers:
        try:
            llm = factory()
            async for chunk in llm.astream(messages):
                if chunk.content:
                    yield chunk.content
            return
        except Exception as e:
            last_error = e
            logger.warning("Streaming provider %s failed: %s — trying next", name, e)

    raise RuntimeError(f"All streaming providers failed. Last error: {last_error}")
