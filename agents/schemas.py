"""Shared response models for provider-enforced structured output."""

from typing import Annotated, Literal

from pydantic import AfterValidator, BaseModel, ConfigDict, Field


class StructuredResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


def _score_range(value: int) -> int:
    if not 0 <= value <= 100:
        raise ValueError("Score must be between 0 and 100")
    return value


# Enforce bounds locally without emitting minimum/maximum, which Anthropic's
# structured output does not support. All providers receive the description.
Score = Annotated[
    int, Field(description="Integer score from 0 to 100, inclusive."), AfterValidator(_score_range)
]


class ScoreBreakdown(StructuredResponse):
    field_alignment: Score
    requirements_met: Score
    experience_fit: Score
    funding_fit: Score
    location_fit: Score


class MatchResult(StructuredResponse):
    not_an_opportunity: bool
    score: Score
    score_breakdown: ScoreBreakdown
    confidence: Literal["low", "medium", "high"]
    summary: str = Field(description="Two or three sentences explaining the match.")
    pros: list[str]
    cons: list[str]
    recommendations: list[str]


class Education(StructuredResponse):
    degree: str
    institution: str
    field: str | None
    year: str | None


class ResearchExperience(StructuredResponse):
    role: str
    institution: str
    duration: str | None
    summary: str


class ParsedCV(StructuredResponse):
    education: list[Education]
    gpa: str | None
    research_experience: list[ResearchExperience]
    publications: list[str]
    languages: list[str]
    skills: list[str]
    summary: str = Field(description="A dense, standalone 100-150 word candidate profile.")


class Requirements(StructuredResponse):
    degree: str | None
    gpa: str | None
    other: list[str]


class ContactInfo(StructuredResponse):
    email: str | None
    url: str | None


class Opportunity(StructuredResponse):
    is_opportunity: bool
    title: str | None
    university: str | None
    department: str | None
    professor: str | None
    type: Literal["msc", "phd"] | None
    deadline: str | None = Field(description="Application deadline in YYYY-MM-DD format, or null if unknown.")
    semester: str | None
    location: str | None
    stipend: str | None
    requirements: Requirements
    how_to_apply: str | None
    contact_info: ContactInfo
