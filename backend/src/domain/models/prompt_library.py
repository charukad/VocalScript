from typing import List, Literal, Optional

from pydantic import Field, field_validator

from backend.src.domain.models.generation import ApiModel


PromptTemplateStatus = Literal["active", "archived"]


def _clean_list(values: List[str]) -> List[str]:
    cleaned = [" ".join(value.split()) for value in values if " ".join(value.split())]
    return list(dict.fromkeys(cleaned))


class PromptTemplateFields(ApiModel):
    name: str
    use_case: str = Field(default="custom", alias="useCase")
    prompt_text: str = Field(alias="promptText")
    variables: List[str] = Field(default_factory=list)
    notes: str = ""
    status: PromptTemplateStatus = "active"

    @field_validator("name", "prompt_text")
    @classmethod
    def validate_required_text(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Prompt name and text are required")
        return cleaned

    @field_validator("variables")
    @classmethod
    def validate_variables(cls, value: List[str]) -> List[str]:
        return _clean_list(value)


class PromptTemplateCreateRequest(PromptTemplateFields):
    pass


class PromptTemplateUpdateRequest(ApiModel):
    name: Optional[str] = None
    use_case: Optional[str] = Field(default=None, alias="useCase")
    prompt_text: Optional[str] = Field(default=None, alias="promptText")
    variables: Optional[List[str]] = None
    notes: Optional[str] = None
    status: Optional[PromptTemplateStatus] = None

    @field_validator("name", "prompt_text")
    @classmethod
    def validate_optional_required_text(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Prompt name and text are required")
        return cleaned

    @field_validator("variables")
    @classmethod
    def validate_optional_variables(cls, value: Optional[List[str]]) -> Optional[List[str]]:
        return _clean_list(value) if value is not None else value


class PromptTemplate(PromptTemplateFields):
    id: str
    profile_id: str = Field(alias="profileId")
    created_at: str = Field(alias="createdAt")
    updated_at: str = Field(alias="updatedAt")


class PromptTemplateListResponse(ApiModel):
    templates: List[PromptTemplate]
