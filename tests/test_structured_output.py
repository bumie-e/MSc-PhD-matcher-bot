from unittest.mock import Mock

import pytest
from pydantic import ValidationError

from agents.cv.parser import structure_cv_text
from agents.llm import LLM
from agents.matching.agent import score_match
from agents.schemas import MatchResult, Opportunity, ParsedCV
from agents.search.agent import structure_listing


def match_payload():
    return {
        "not_an_opportunity": False,
        "score": 77,
        "score_breakdown": {
            "field_alignment": 85, "requirements_met": 80, "experience_fit": 70,
            "funding_fit": 75, "location_fit": 80,
        },
        "confidence": "medium", "summary": " A good match. ",
        "pros": ["Relevant skills"], "cons": [], "recommendations": [],
    }


def listing_payload(is_opportunity=True):
    return {
        "is_opportunity": is_opportunity,
        "title": "PhD in ML" if is_opportunity else None,
        "university": "University" if is_opportunity else None,
        "department": None, "professor": None, "type": "phd" if is_opportunity else None,
        "deadline": None, "semester": None, "location": None, "stipend": None,
        "requirements": {"degree": None, "gpa": None, "other": []},
        "how_to_apply": None, "contact_info": {"email": None, "url": None},
    }


def test_matching_uses_schema_and_preserves_database_shape():
    llm = Mock(spec=LLM)
    llm.complete_structured.return_value = MatchResult.model_validate(match_payload())
    result = score_match(llm, {"parsed": {"summary": "Candidate"}}, {}, {"id": "opp"})
    assert llm.complete_structured.call_args.args[2] is MatchResult
    assert result == {**match_payload(), "summary": "A good match."}


@pytest.mark.parametrize("value", [-1, 101, "77", True, 77.5])
@pytest.mark.parametrize("field", ["score", "field_alignment"])
def test_invalid_scores_are_rejected(value, field):
    payload = match_payload()
    if field == "score":
        payload[field] = value
    else:
        payload["score_breakdown"][field] = value
    with pytest.raises(ValidationError):
        MatchResult.model_validate(payload)


def test_non_opportunity_verdict_is_preserved_for_matching():
    payload = match_payload()
    payload["not_an_opportunity"] = True
    payload["score"] = 0
    llm = Mock(spec=LLM)
    llm.complete_structured.return_value = MatchResult.model_validate(payload)
    assert score_match(llm, {}, {}, {})["not_an_opportunity"] is True


def test_cv_uses_schema_and_preserves_nullable_fields():
    llm = Mock(spec=LLM)
    payload = {
        "education": [{"degree": "BSc", "institution": "University", "field": None, "year": None}],
        "gpa": None, "research_experience": [], "publications": [], "languages": [], "skills": [],
        "summary": "Candidate profile",
    }
    llm.complete_structured.return_value = ParsedCV.model_validate(payload)
    assert structure_cv_text("CV text", llm) == payload
    assert llm.complete_structured.call_args.args[2] is ParsedCV


@pytest.mark.parametrize("is_opportunity", [True, False])
def test_listing_uses_schema_and_filters_non_opportunities(is_opportunity):
    llm = Mock(spec=LLM)
    llm.complete_structured.return_value = Opportunity.model_validate(listing_payload(is_opportunity))
    listing = {"title": "Listing", "source_url": "https://example.com/phd", "source_name": "test"}
    result = structure_listing(listing, llm)
    assert llm.complete_structured.call_args.args[2] is Opportunity
    if is_opportunity:
        assert result["source_url"] == listing["source_url"]
        assert result["title"] == "PhD in ML"
        assert result["deadline"] is None
        assert "is_opportunity" not in result
    else:
        assert result is None


def test_invalid_structured_output_keeps_callers_skip_or_error_behavior():
    llm = Mock(spec=LLM)
    llm.complete_structured.return_value = None
    assert score_match(llm, {}, {}, {}) is None
    assert structure_listing({"title": "Listing", "source_url": "https://example.com/phd"}, llm) is None
    with pytest.raises(ValueError, match="readable CV structure"):
        structure_cv_text("CV text", llm)


@pytest.mark.parametrize("model", [MatchResult, ParsedCV, Opportunity])
def test_provider_schemas_require_all_fields_and_close_every_object(model):
    def check(node):
        if isinstance(node, dict):
            if node.get("type") == "object":
                assert node["additionalProperties"] is False
                assert set(node["required"]) == set(node["properties"])
            # These constraints are unsupported by Anthropic's JSON Schema mode.
            assert not {"minimum", "maximum", "minLength", "maxLength"}.intersection(node)
            for value in node.values():
                check(value)
        elif isinstance(node, list):
            for value in node:
                check(value)

    check(model.model_json_schema())
