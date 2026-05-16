import tempfile
import unittest
from pathlib import Path

from backend.src.domain.models.brand_kit import BrandKitUpdateRequest
from backend.src.domain.models.caption_design import CaptionDesignRequest
from backend.src.domain.models.content_profile import ContentProfileCreateRequest
from backend.src.domain.services.brand_kit_service import BrandKitService
from backend.src.domain.services.caption_design_service import CaptionDesignService
from backend.src.domain.services.content_profile_service import ContentProfileService
from backend.src.domain.services.sqlite_store import SQLiteStore


class CaptionDesignServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)
        self.store = SQLiteStore(str(self.root / "registry.db"))
        self.profile_service = ContentProfileService(self.store)
        self.brand_kit_service = BrandKitService(self.store)
        self.caption_design_service = CaptionDesignService()
        self.profile = self.profile_service.create_profile(
            ContentProfileCreateRequest(name="Daily AI Facts")
        )
        self.brand_kit = self.brand_kit_service.update(
            self.profile,
            BrandKitUpdateRequest(
                colorPalette=["#22cc88"],
                fontFamilies=["Space Grotesk"],
            ),
        )

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def test_caption_designs_use_brand_kit_and_platform_defaults(self) -> None:
        result = self.caption_design_service.generate(
            self.profile,
            self.brand_kit,
            CaptionDesignRequest(
                sampleText="Most creators miss the third signal in this chart.",
                platform="youtube_shorts",
                emphasis="bold",
            ),
        )
        self.assertEqual(len(result.designs), 3)
        self.assertEqual(result.designs[0].font_family, "Space Grotesk")
        self.assertEqual(result.designs[1].bg_color, "#22cc88")
        self.assertLess(result.designs[0].y, 85)
        self.assertTrue(all(design.preview_lines for design in result.designs))
