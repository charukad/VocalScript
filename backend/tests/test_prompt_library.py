import tempfile
import unittest
from pathlib import Path

from backend.src.domain.models.content_profile import ContentProfileCreateRequest
from backend.src.domain.models.prompt_library import (
    PromptTemplateCreateRequest,
    PromptTemplateUpdateRequest,
)
from backend.src.domain.services.content_profile_service import ContentProfileService
from backend.src.domain.services.prompt_library_service import PromptLibraryService
from backend.src.domain.services.sqlite_store import SQLiteStore


class PromptLibraryServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)
        self.store = SQLiteStore(str(self.root / "registry.db"))
        self.profile_service = ContentProfileService(self.store)
        self.prompt_library_service = PromptLibraryService(self.store)
        self.profile = self.profile_service.create_profile(
            ContentProfileCreateRequest(name="Daily AI Facts")
        )

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def test_prompt_template_crud_and_archive(self) -> None:
        created = self.prompt_library_service.create_template(
            self.profile.id,
            PromptTemplateCreateRequest(
                name="Hook rewrite",
                useCase="script_rewrite",
                promptText="Rewrite {{script}} for {{platform}}",
                variables=["script", "platform", "script"],
            ),
        )
        self.assertEqual(created.variables, ["script", "platform"])
        self.assertEqual(len(self.prompt_library_service.list_templates(self.profile.id)), 1)

        updated = self.prompt_library_service.update_template(
            created.id,
            PromptTemplateUpdateRequest(notes="Use for fast-paced shorts."),
        )
        self.assertIsNotNone(updated)
        self.assertEqual(updated.notes, "Use for fast-paced shorts.")

        archived = self.prompt_library_service.archive_template(created.id)
        self.assertIsNotNone(archived)
        self.assertEqual(archived.status, "archived")
        self.assertEqual(self.prompt_library_service.list_templates(self.profile.id), [])
