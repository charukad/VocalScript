import tempfile
import unittest
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.src.api.content_profiles import build_content_profiles_router
from backend.src.domain.services.content_profile_service import ContentProfileService
from backend.src.domain.services.sqlite_store import SQLiteStore


class ContentProfileApiTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        registry_path = Path(self.temp_dir.name) / "registry.db"
        self.registry_path = registry_path
        self.store = SQLiteStore(str(registry_path))
        self.service = ContentProfileService(self.store)
        app = FastAPI()
        app.include_router(build_content_profiles_router(self.service))
        self.client = TestClient(app)

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def test_profile_crud_archive_and_persistence(self) -> None:
        create_response = self.client.post(
            "/api/content-profiles",
            json={
                "name": "Daily AI Facts",
                "platforms": ["youtube_shorts", "tiktok", "youtube_shorts"],
                "description": "Short educational videos about AI tools.",
                "avatarPath": "/tmp/daily-ai-facts.png",
            },
        )
        self.assertEqual(create_response.status_code, 200)
        created = create_response.json()
        self.assertEqual(created["name"], "Daily AI Facts")
        self.assertEqual(created["platforms"], ["youtube_shorts", "tiktok"])
        self.assertEqual(created["tone"], "clear, engaging")
        self.assertEqual(created["avatarPath"], "/tmp/daily-ai-facts.png")

        list_response = self.client.get("/api/content-profiles")
        self.assertEqual(list_response.status_code, 200)
        self.assertEqual([item["id"] for item in list_response.json()["profiles"]], [created["id"]])

        update_response = self.client.put(
            f"/api/content-profiles/{created['id']}",
            json={
                "tone": "fast, curious, simple",
                "defaultVideoLengthSeconds": 35,
                "brandColors": ["#111111", "#22cc88"],
            },
        )
        self.assertEqual(update_response.status_code, 200)
        updated = update_response.json()
        self.assertEqual(updated["tone"], "fast, curious, simple")
        self.assertEqual(updated["defaultVideoLengthSeconds"], 35)
        self.assertEqual(updated["brandColors"], ["#111111", "#22cc88"])

        archive_response = self.client.delete(f"/api/content-profiles/{created['id']}")
        self.assertEqual(archive_response.status_code, 200)
        self.assertTrue(archive_response.json()["isArchived"])

        active_profiles = self.client.get("/api/content-profiles").json()["profiles"]
        archived_profiles = self.client.get("/api/content-profiles?includeArchived=true").json()["profiles"]
        self.assertEqual(active_profiles, [])
        self.assertEqual([item["id"] for item in archived_profiles], [created["id"]])

        reopened_service = ContentProfileService(SQLiteStore(str(self.registry_path)))
        persisted = reopened_service.get_profile(created["id"])
        self.assertIsNotNone(persisted)
        assert persisted is not None
        self.assertEqual(persisted.name, "Daily AI Facts")
        self.assertTrue(persisted.is_archived)
        self.assertEqual(persisted.brand_colors, ["#111111", "#22cc88"])

    def test_profile_validation_rejects_empty_name_and_platforms(self) -> None:
        empty_name = self.client.post("/api/content-profiles", json={"name": "   "})
        self.assertEqual(empty_name.status_code, 422)

        empty_platforms = self.client.post(
            "/api/content-profiles",
            json={"name": "Daily AI Facts", "platforms": []},
        )
        self.assertEqual(empty_platforms.status_code, 422)


if __name__ == "__main__":
    unittest.main()
