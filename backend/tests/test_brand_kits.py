import tempfile
import unittest
from pathlib import Path

from backend.src.domain.models.brand_kit import BrandKitUpdateRequest
from backend.src.domain.models.content_profile import ContentProfileCreateRequest
from backend.src.domain.services.brand_kit_service import BrandKitService
from backend.src.domain.services.content_profile_service import ContentProfileService
from backend.src.domain.services.sqlite_store import SQLiteStore


class BrandKitServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)
        self.store = SQLiteStore(str(self.root / "registry.db"))
        self.profile_service = ContentProfileService(self.store)
        self.brand_kit_service = BrandKitService(self.store)
        self.profile = self.profile_service.create_profile(
            ContentProfileCreateRequest(
                name="Daily AI Facts",
                brandColors=["#111111", "#22cc88"],
                captionStyle="bold captions",
                visualStyle="futuristic tech visuals",
            )
        )

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def test_brand_kit_seeds_from_profile_and_updates(self) -> None:
        brand_kit = self.brand_kit_service.get_or_create(self.profile)
        self.assertEqual(brand_kit.color_palette, ["#111111", "#22cc88"])
        self.assertEqual(brand_kit.caption_preset, "bold captions")
        self.assertEqual(brand_kit.thumbnail_style, "futuristic tech visuals")

        updated = self.brand_kit_service.update(
            self.profile,
            BrandKitUpdateRequest(
                fontFamilies=["Inter", "Inter", "Space Grotesk"],
                toneKeywords=["fast", "curious"],
                avoidKeywords=["slow"],
                defaultCta="Follow for daily AI facts",
            ),
        )
        self.assertEqual(updated.font_families, ["Inter", "Space Grotesk"])
        self.assertEqual(updated.tone_keywords, ["fast", "curious"])
        self.assertEqual(updated.avoid_keywords, ["slow"])
        self.assertEqual(updated.default_cta, "Follow for daily AI facts")
