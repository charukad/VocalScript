import tempfile
import unittest
from pathlib import Path

from backend.src.domain.models.character_consistency import (
    CharacterProfileCreateRequest,
    CharacterProfileUpdateRequest,
)
from backend.src.domain.models.content_profile import ContentProfileCreateRequest
from backend.src.domain.services.character_consistency_service import CharacterConsistencyService
from backend.src.domain.services.content_profile_service import ContentProfileService
from backend.src.domain.services.sqlite_store import SQLiteStore


class CharacterConsistencyServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)
        self.store = SQLiteStore(str(self.root / "registry.db"))
        self.profile_service = ContentProfileService(self.store)
        self.service = CharacterConsistencyService(self.store)
        self.profile = self.profile_service.create_profile(
            ContentProfileCreateRequest(name="Story Lab", platforms=["youtube_shorts"])
        )

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def test_character_profiles_support_prompt_packs_and_archiving(self) -> None:
        character = self.service.create_character(
            self.profile.id,
            CharacterProfileCreateRequest(
                name="Nova",
                description="young science host",
                visualTraits=["silver bob haircut", "round glasses"],
                wardrobe=["yellow jacket"],
                promptAnchor="Nova, the recurring host",
                negativePrompt="different hair color",
            ),
        )
        prompt_pack = self.service.build_prompt_pack(character.id)
        self.assertIsNotNone(prompt_pack)
        assert prompt_pack is not None
        self.assertIn("silver bob haircut", prompt_pack.prompt)
        updated = self.service.update_character(
            character.id,
            CharacterProfileUpdateRequest(voiceNotes="warm, quick delivery"),
        )
        self.assertIsNotNone(updated)
        archived = self.service.archive_character(character.id)
        self.assertIsNotNone(archived)
        self.assertEqual(self.service.list_characters(self.profile.id), [])
        self.assertEqual(len(self.service.list_characters(self.profile.id, include_archived=True)), 1)
