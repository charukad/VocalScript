from typing import List, Literal, Optional

from pydantic import Field, field_validator

from backend.src.domain.models.generation import ApiModel


CharacterProfileStatus = Literal["active", "archived"]


class CharacterProfileFields(ApiModel):
    name: str
    role: str = ""
    description: str = ""
    visual_traits: List[str] = Field(default_factory=list, alias="visualTraits")
    wardrobe: List[str] = Field(default_factory=list)
    voice_notes: str = Field(default="", alias="voiceNotes")
    prompt_anchor: str = Field(default="", alias="promptAnchor")
    negative_prompt: str = Field(default="", alias="negativePrompt")
    reference_asset_ids: List[str] = Field(default_factory=list, alias="referenceAssetIds")
    status: CharacterProfileStatus = "active"

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Character name is required")
        return cleaned


class CharacterProfileCreateRequest(CharacterProfileFields):
    pass


class CharacterProfileUpdateRequest(ApiModel):
    name: Optional[str] = None
    role: Optional[str] = None
    description: Optional[str] = None
    visual_traits: Optional[List[str]] = Field(default=None, alias="visualTraits")
    wardrobe: Optional[List[str]] = None
    voice_notes: Optional[str] = Field(default=None, alias="voiceNotes")
    prompt_anchor: Optional[str] = Field(default=None, alias="promptAnchor")
    negative_prompt: Optional[str] = Field(default=None, alias="negativePrompt")
    reference_asset_ids: Optional[List[str]] = Field(default=None, alias="referenceAssetIds")
    status: Optional[CharacterProfileStatus] = None

    @field_validator("name")
    @classmethod
    def validate_optional_name(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Character name is required")
        return cleaned


class CharacterProfile(CharacterProfileFields):
    id: str
    profile_id: str = Field(alias="profileId")
    created_at: str = Field(alias="createdAt")
    updated_at: str = Field(alias="updatedAt")


class CharacterProfileListResponse(ApiModel):
    characters: List[CharacterProfile]


class CharacterPromptPack(ApiModel):
    character_id: str = Field(alias="characterId")
    prompt: str
    negative_prompt: str = Field(alias="negativePrompt")
    notes: List[str] = Field(default_factory=list)
