from fastapi import APIRouter, HTTPException, Query

from backend.src.domain.models.character_consistency import (
    CharacterProfile,
    CharacterProfileCreateRequest,
    CharacterProfileListResponse,
    CharacterProfileUpdateRequest,
    CharacterPromptPack,
)
from backend.src.domain.services.character_consistency_service import CharacterConsistencyService
from backend.src.domain.services.content_profile_service import ContentProfileService


def build_characters_router(
    content_profile_service: ContentProfileService,
    character_service: CharacterConsistencyService,
) -> APIRouter:
    router = APIRouter(tags=["characters"])

    def require_profile(profile_id: str):
        profile = content_profile_service.get_profile(profile_id)
        if not profile or profile.is_archived:
            raise HTTPException(status_code=404, detail="Content profile not found")
        return profile

    @router.get(
        "/api/content-profiles/{profile_id}/characters",
        response_model=CharacterProfileListResponse,
    )
    async def list_characters(profile_id: str, include_archived: bool = Query(False, alias="includeArchived")):
        require_profile(profile_id)
        return CharacterProfileListResponse(
            characters=character_service.list_characters(profile_id, include_archived=include_archived)
        )

    @router.post("/api/content-profiles/{profile_id}/characters", response_model=CharacterProfile)
    async def create_character(profile_id: str, request: CharacterProfileCreateRequest):
        require_profile(profile_id)
        return character_service.create_character(profile_id, request)

    @router.put("/api/characters/{character_id}", response_model=CharacterProfile)
    async def update_character(character_id: str, request: CharacterProfileUpdateRequest):
        character = character_service.update_character(character_id, request)
        if not character:
            raise HTTPException(status_code=404, detail="Character not found")
        return character

    @router.delete("/api/characters/{character_id}", response_model=CharacterProfile)
    async def archive_character(character_id: str):
        character = character_service.archive_character(character_id)
        if not character:
            raise HTTPException(status_code=404, detail="Character not found")
        return character

    @router.get("/api/characters/{character_id}/prompt-pack", response_model=CharacterPromptPack)
    async def get_prompt_pack(character_id: str):
        prompt_pack = character_service.build_prompt_pack(character_id)
        if not prompt_pack:
            raise HTTPException(status_code=404, detail="Character not found")
        return prompt_pack

    return router
