import tempfile
import unittest
from pathlib import Path

from backend.src.domain.models.content_calendar import (
    CalendarItemCreateRequest,
    CalendarItemUpdateRequest,
)
from backend.src.domain.models.content_profile import ContentProfileCreateRequest
from backend.src.domain.services.content_calendar_service import ContentCalendarService
from backend.src.domain.services.content_profile_service import ContentProfileService
from backend.src.domain.services.sqlite_store import SQLiteStore


class ContentCalendarServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)
        self.store = SQLiteStore(str(self.root / "registry.db"))
        self.profile_service = ContentProfileService(self.store)
        self.calendar_service = ContentCalendarService(self.store)
        self.profile = self.profile_service.create_profile(
            ContentProfileCreateRequest(name="Daily AI Facts")
        )

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def test_calendar_item_crud_and_sorting(self) -> None:
        later = self.calendar_service.create_item(
            self.profile.id,
            CalendarItemCreateRequest(
                title="Later post",
                scheduledAt="2026-05-18T12:00:00+00:00",
                platform="youtube_shorts",
            ),
        )
        earlier = self.calendar_service.create_item(
            self.profile.id,
            CalendarItemCreateRequest(
                title="Earlier post",
                scheduledAt="2026-05-17T12:00:00+00:00",
                platform="tiktok",
            ),
        )
        self.assertEqual([item.id for item in self.calendar_service.list_items(self.profile.id)], [earlier.id, later.id])

        updated = self.calendar_service.update_item(
            later.id,
            CalendarItemUpdateRequest(status="ready", notes="Final export approved."),
        )
        self.assertIsNotNone(updated)
        self.assertEqual(updated.status, "ready")

        archived = self.calendar_service.archive_item(earlier.id)
        self.assertIsNotNone(archived)
        self.assertEqual(archived.status, "archived")
        self.assertEqual([item.id for item in self.calendar_service.list_items(self.profile.id)], [later.id])
