import tempfile
import unittest
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.src.api.analytics import build_analytics_router
from backend.src.api.content_profiles import build_content_profiles_router
from backend.src.domain.models.content_profile import ContentProfileCreateRequest
from backend.src.domain.services.analytics_service import AnalyticsService
from backend.src.domain.services.content_profile_service import ContentProfileService
from backend.src.domain.services.sqlite_store import SQLiteStore


class AnalyticsApiTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        registry_path = Path(self.temp_dir.name) / "registry.db"
        self.store = SQLiteStore(str(registry_path))
        self.profile_service = ContentProfileService(self.store)
        self.analytics_service = AnalyticsService(self.store, self.profile_service)
        self.profile = self.profile_service.create_profile(
            ContentProfileCreateRequest(name="Daily AI Facts", platforms=["youtube_shorts"])
        )
        app = FastAPI()
        app.include_router(build_content_profiles_router(self.profile_service))
        app.include_router(build_analytics_router(self.profile_service, self.analytics_service))
        self.client = TestClient(app)

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def test_connections_and_manual_performance_import(self) -> None:
        connection_response = self.client.put(
            f"/api/content-profiles/{self.profile.id}/analytics/connections/youtube_shorts",
            json={
                "status": "manual_only",
                "displayName": "Daily AI Facts",
                "externalAccountId": "channel-123",
            },
        )
        self.assertEqual(connection_response.status_code, 200)
        connection = connection_response.json()
        self.assertEqual(connection["status"], "manual_only")
        self.assertIsNone(connection["tokenReference"])

        list_response = self.client.get(
            f"/api/content-profiles/{self.profile.id}/analytics/connections"
        )
        self.assertEqual(list_response.status_code, 200)
        self.assertEqual(len(list_response.json()["connections"]), 1)

        performance_response = self.client.post(
            f"/api/content-profiles/{self.profile.id}/analytics/performance/manual",
            json={
                "platform": "youtube_shorts",
                "title": "Three AI habits",
                "videoLengthSeconds": 42,
                "hookType": "curiosity",
                "metrics": {
                    "views": 1200,
                    "impressions": 3000,
                    "ctr": 4.2,
                    "averageViewDurationSeconds": 31.5,
                    "audienceRetentionPercent": 75.0,
                    "watchTimeMinutes": 630,
                    "likes": 90,
                    "comments": 12,
                    "shares": 20,
                    "followersGained": 8,
                },
            },
        )
        self.assertEqual(performance_response.status_code, 200)
        performance = performance_response.json()
        self.assertEqual(performance["metrics"]["views"], 1200)
        self.assertEqual(performance["hookType"], "curiosity")

        stored_profile = self.profile_service.get_profile(self.profile.id)
        self.assertIsNotNone(stored_profile)
        assert stored_profile is not None
        self.assertEqual(
            stored_profile.analytics_connection_status["youtube_shorts"],
            "manual_only",
        )

        listed_performance = self.client.get(
            f"/api/content-profiles/{self.profile.id}/analytics/performance"
        )
        self.assertEqual(listed_performance.status_code, 200)
        self.assertEqual(
            [item["title"] for item in listed_performance.json()["performance"]],
            ["Three AI habits"],
        )


if __name__ == "__main__":
    unittest.main()
