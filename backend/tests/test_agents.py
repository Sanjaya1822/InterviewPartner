"""
Unit tests for AI agent state management and utilities.
"""
import pytest
from app.services.ai.agents import (
    _infer_category,
    _score_to_recommendation,
    _score_to_readiness,
    _parse_json_response,
)


def test_infer_category_python():
    assert _infer_category("What is a Python decorator?", "Python Developer") == "Python"


def test_infer_category_dsa():
    q = "How would you reverse a linked list?"
    assert _infer_category(q, "Software Engineer") == "Data Structures"


def test_infer_category_behavioral():
    q = "Tell me about a time you resolved a conflict"
    assert _infer_category(q, "HR") == "Behavioral"


def test_infer_category_fallback():
    assert _infer_category("Something completely generic", "any") == "General"


def test_score_to_recommendation():
    assert _score_to_recommendation(90) == "strong_yes"
    assert _score_to_recommendation(72) == "yes"
    assert _score_to_recommendation(57) == "maybe"
    assert _score_to_recommendation(43) == "no"
    assert _score_to_recommendation(20) == "strong_no"


def test_score_to_readiness():
    assert _score_to_readiness(85) == "ready"
    assert _score_to_readiness(68) == "almost_ready"
    assert _score_to_readiness(50) == "needs_work"
    assert _score_to_readiness(30) == "not_ready"


def test_parse_json_response_clean():
    text = '{"score": 80, "feedback": "Good answer"}'
    result = _parse_json_response(text)
    assert result["score"] == 80


def test_parse_json_response_with_markdown():
    text = "```json\n{\"score\": 75}\n```"
    result = _parse_json_response(text)
    # Should find the JSON block inside markdown
    assert isinstance(result, dict)


def test_parse_json_response_embedded():
    text = "Here is the evaluation: {\"overall_score\": 65, \"feedback\": \"Average\"}"
    result = _parse_json_response(text)
    assert result.get("overall_score") == 65


def test_parse_json_response_invalid():
    result = _parse_json_response("This is not JSON at all")
    assert result == {}
