import json
import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from backend.src.domain.models.content_profile import ContentProfileCreateRequest
from backend.src.domain.services.content_profile_service import ContentProfileService
from backend.src.domain.services.project_service import ProjectService
from backend.src.domain.services.sqlite_store import SQLiteStore


class ProjectProfileMetadataTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)
        self.registry_path = self.root / "registry.db"
        self.projects_dir = self.root / "projects"
        self.store = SQLiteStore(str(self.registry_path))
        self.project_service = ProjectService(str(self.projects_dir), store=self.store)
        self.profile_service = ContentProfileService(self.store)

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def test_project_profile_metadata_persists_and_partial_updates_do_not_clear_other_fields(self) -> None:
        profile = self.profile_service.create_profile(
            ContentProfileCreateRequest(name="Daily AI Facts", platforms=["youtube_shorts"])
        )
        project = self.project_service.create_project(
            "Daily Clip",
            content_profile_id=profile.id,
            target_platform="youtube_shorts",
            content_goal="Reach new creators",
            video_type="Short explainer",
            planned_title="Three AI tools",
        )
        saved = self.project_service.save_project(
            project.id,
            project.name,
            {"project": project.model_dump(by_alias=True)},
            metadata_updates={"target_platform": "tiktok", "planned_description": "Fast list video"},
        )
        self.assertIsNotNone(saved)
        assert saved is not None
        self.assertEqual(saved.content_profile_id, profile.id)
        self.assertEqual(saved.target_platform, "tiktok")
        self.assertEqual(saved.content_goal, "Reach new creators")
        self.assertEqual(saved.planned_title, "Three AI tools")
        self.assertEqual(saved.planned_description, "Fast list video")

        reopened_store = SQLiteStore(str(self.registry_path))
        reopened_project = ProjectService(str(self.projects_dir), store=reopened_store).get_project(project.id)
        self.assertIsNotNone(reopened_project)
        assert reopened_project is not None
        self.assertEqual(reopened_project.content_profile_id, profile.id)
        self.assertEqual(reopened_project.target_platform, "tiktok")
        self.assertEqual(reopened_project.planned_description, "Fast list video")

    def test_legacy_project_json_without_profile_fields_still_loads(self) -> None:
        legacy_dir = self.root / "legacy-project"
        legacy_dir.mkdir(parents=True)
        legacy_file = legacy_dir / "project.json"
        legacy_file.write_text(
            json.dumps(
                {
                    "id": "project-legacy",
                    "name": "Legacy Project",
                    "folderPath": str(legacy_dir),
                    "generatedMediaPath": str(legacy_dir / "generated"),
                    "projectFilePath": str(legacy_file),
                    "createdAt": "2026-05-15T00:00:00+00:00",
                    "updatedAt": "2026-05-15T00:00:00+00:00",
                    "state": {},
                }
            ),
            encoding="utf-8",
        )

        loaded = self.project_service.load_project_from_path(str(legacy_file))
        self.assertIsNotNone(loaded)
        assert loaded is not None
        self.assertIsNone(loaded.content_profile_id)
        self.assertIsNone(loaded.target_platform)
        self.assertEqual(loaded.content_goal, "")
        self.assertEqual(loaded.video_type, "")

    def test_bootstrap_reads_registered_project_when_writable_open_is_unavailable(self) -> None:
        project = self.project_service.create_project("Read Only Project")
        reopened_store = SQLiteStore(str(self.registry_path))
        original_project_connect = reopened_store._project_connect

        def fail_for_project_db(database_path: Path):
            if database_path == Path(project.folder_path) / "project.db":
                raise sqlite3.OperationalError("unable to open database file")
            return original_project_connect(database_path)

        with patch.object(reopened_store, "_project_connect", side_effect=fail_for_project_db):
            reopened_service = ProjectService(str(self.projects_dir), store=reopened_store)
            reopened_project = reopened_service.get_project(project.id)

        self.assertIsNotNone(reopened_project)
        assert reopened_project is not None
        self.assertEqual(reopened_project.id, project.id)

    def test_bootstrap_skips_legacy_project_reindex_when_folder_is_not_writable(self) -> None:
        legacy_dir = self.root / "legacy-read-only"
        legacy_dir.mkdir(parents=True)
        legacy_file = legacy_dir / "project.json"
        legacy_file.write_text(
            json.dumps(
                {
                    "id": "project-legacy-read-only",
                    "name": "Legacy Read Only",
                    "folderPath": str(legacy_dir),
                    "generatedMediaPath": str(legacy_dir / "generated"),
                    "projectFilePath": str(legacy_file),
                    "createdAt": "2026-05-15T00:00:00+00:00",
                    "updatedAt": "2026-05-15T00:00:00+00:00",
                    "state": {},
                }
            ),
            encoding="utf-8",
        )
        (self.projects_dir / "registry.json").write_text(
            json.dumps({"projectFiles": [str(legacy_file)]}),
            encoding="utf-8",
        )
        reopened_store = SQLiteStore(str(self.registry_path))

        with patch.object(reopened_store, "upsert_project", side_effect=sqlite3.OperationalError("read only")):
            reopened_service = ProjectService(str(self.projects_dir), store=reopened_store)
            projects = reopened_service.list_projects()

        self.assertEqual([project.id for project in projects], ["project-legacy-read-only"])


if __name__ == "__main__":
    unittest.main()
