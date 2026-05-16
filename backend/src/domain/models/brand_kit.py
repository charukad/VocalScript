from typing import List, Optional

from pydantic import Field, field_validator

from backend.src.domain.models.generation import ApiModel


def _clean_list(values: List[str]) -> List[str]:
    cleaned = [" ".join(value.split()) for value in values if " ".join(value.split())]
    return list(dict.fromkeys(cleaned))


class BrandKitFields(ApiModel):
    logo_path: Optional[str] = Field(default=None, alias="logoPath")
    color_palette: List[str] = Field(default_factory=list, alias="colorPalette")
    font_families: List[str] = Field(default_factory=list, alias="fontFamilies")
    tone_keywords: List[str] = Field(default_factory=list, alias="toneKeywords")
    avoid_keywords: List[str] = Field(default_factory=list, alias="avoidKeywords")
    caption_preset: str = Field(default="", alias="captionPreset")
    thumbnail_style: str = Field(default="", alias="thumbnailStyle")
    default_cta: str = Field(default="", alias="defaultCta")
    music_style: str = Field(default="", alias="musicStyle")

    @field_validator("color_palette", "font_families", "tone_keywords", "avoid_keywords")
    @classmethod
    def validate_lists(cls, value: List[str]) -> List[str]:
        return _clean_list(value)


class BrandKitUpdateRequest(ApiModel):
    logo_path: Optional[str] = Field(default=None, alias="logoPath")
    color_palette: Optional[List[str]] = Field(default=None, alias="colorPalette")
    font_families: Optional[List[str]] = Field(default=None, alias="fontFamilies")
    tone_keywords: Optional[List[str]] = Field(default=None, alias="toneKeywords")
    avoid_keywords: Optional[List[str]] = Field(default=None, alias="avoidKeywords")
    caption_preset: Optional[str] = Field(default=None, alias="captionPreset")
    thumbnail_style: Optional[str] = Field(default=None, alias="thumbnailStyle")
    default_cta: Optional[str] = Field(default=None, alias="defaultCta")
    music_style: Optional[str] = Field(default=None, alias="musicStyle")

    @field_validator("color_palette", "font_families", "tone_keywords", "avoid_keywords")
    @classmethod
    def validate_optional_lists(cls, value: Optional[List[str]]) -> Optional[List[str]]:
        return _clean_list(value) if value is not None else value


class BrandKit(BrandKitFields):
    id: str
    profile_id: str = Field(alias="profileId")
    created_at: str = Field(alias="createdAt")
    updated_at: str = Field(alias="updatedAt")
