import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from backend.src.domain.models.content_profile import ContentProfileCreateRequest
from backend.src.domain.models.trend_radar import TrendRssImportRequest
from backend.src.domain.services.content_profile_service import ContentProfileService
from backend.src.domain.services.content_studio_service import ContentStudioService
from backend.src.domain.services.sqlite_store import SQLiteStore
from backend.src.domain.services.trend_radar_service import TrendRadarService


class _FakeResponse:
    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def read(self):
        return b"""
        <rss><channel>
          <item><title>AI workflow changes</title></item>
          <item><title>Creator monetization shifts</title></item>
        </channel></rss>
        """


class TrendRadarServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)
        self.store = SQLiteStore(str(self.root / "registry.db"))
        self.profile_service = ContentProfileService(self.store)
        self.studio_service = ContentStudioService(self.store)
        self.service = TrendRadarService(self.studio_service)
        self.profile = self.profile_service.create_profile(
            ContentProfileCreateRequest(
                name="Daily AI Facts",
                platforms=["youtube_shorts"],
                contentType="AI education",
                targetAudience="beginners",
            )
        )

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    @patch("backend.src.domain.services.trend_radar_service.urllib_request.urlopen")
    def test_rss_import_creates_external_trends(self, urlopen) -> None:
        urlopen.return_value = _FakeResponse()
        result = self.service.import_rss(
            self.profile,
            TrendRssImportRequest(feedUrl="https://example.com/feed.xml", maxItems=5),
        )
        self.assertEqual(result.provider, "rss_feed")
        self.assertEqual(result.imported_count, 2)
        self.assertEqual(len(self.studio_service.list_trends(self.profile.id)), 2)
        self.assertEqual(self.service.list_sources()[-1].status, "blocked_pending_credentials")
