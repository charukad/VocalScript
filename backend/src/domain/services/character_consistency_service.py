import uuid
from typing import List, Optional

from backend.src.domain.models.character_consistency import (
    CharacterProfile,
    CharacterProfileCreateRequest,
    CharacterProfileUpdateRequest,
    CharacterPromptPack,
)
from backend.src.domain.models.project import utc_now_iso
from backend.src.domain.services.sqlite_store import SQLiteStore


class CharacterConsistencyService:
    def __init__(self, store: SQLiteStore):
        self.store = store

    def create_character(
        self,
        profile_id: str,
        request: CharacterProfileCreateRequest,
    ) -> CharacterProfile:
        now = utc_now_iso()
        character = CharacterProfile(
            id=f"character-{uuid.uuid4().hex[:12]}",
            profileId=profile_id,
            createdAt=now,
            updatedAt=now,
            **request.model_dump(by_alias=True),
        )
        self.store.upsert_character_profile(character)
        return character

    def list_characters(self, profile_id: str, include_archived: bool = False) -> List[CharacterProfile]:
        return self.store.list_character_profiles(profile_id, include_archived=include_archived)

    def update_character(
        self,
        character_id: str,
        request: CharacterProfileUpdateRequest,
    ) -> Optional[CharacterProfile]:
        existing = self.store.get_character_profile(character_id)
        if not existing:
            return None
        character = existing.model_copy(
            update={
                **request.model_dump(by_alias=False, exclude_unset=True),
                "updated_at": utc_now_iso(),
            }
        )
        self.store.upsert_character_profile(character)
        return character

    def archive_character(self, character_id: str) -> Optional[CharacterProfile]:
        existing = self.store.get_character_profile(character_id)
        if not existing:
            return None
        character = existing.model_copy(update={"status": "archived", "updated_at": utc_now_iso()})
        self.store.upsert_character_profile(character)
        return character

    def build_prompt_pack(self, character_id: str) -> Optional[CharacterPromptPack]:
        character = self.store.get_character_profile(character_id)
        if not character:
            return None
        visual_bits = ", ".join(character.visual_traits + character.wardrobe)
        prompt_parts = [
            character.prompt_anchor or character.name,
            character.description,
            visual_bits,
        ]
        prompt = ", ".join(part.strip() for part in prompt_parts if part.strip())
        notes = []
        if character.voice_notes:
            notes.append(f"Voice: {character.voice_notes}")
        if character.reference_asset_ids:
            notes.append(f"Use {len(character.reference_asset_ids)} stored reference asset(s) for continuity.")
        return CharacterPromptPack(
            characterId=character.id,
            prompt=prompt,
            negativePrompt=character.negative_prompt,
            notes=notes,
        )
