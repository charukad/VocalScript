import tempfile
import unittest
from pathlib import Path

from backend.src.config import LocalLLMSettings
from backend.src.domain.models.content_profile import ContentProfileCreateRequest
from backend.src.domain.models.packaging import PackagingGenerationRequest
from backend.src.domain.services.content_profile_service import ContentProfileService
from backend.src.domain.services.packaging_service import PackagingService
from backend.src.domain.services.sqlite_store import SQLiteStore
from backend.src.domain.services.viral_scoring_service import ViralScoringService
from backend.src.infrastructure.local_llm_service import LocalLLMService


class PackagingServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)
        self.store = SQLiteStore(str(self.root / "registry.db"))
        self.profile_service = ContentProfileService(self.store)
        self.profile = self.profile_service.create_profile(
            ContentProfileCreateRequest(
                name="Daily AI Facts",
                platforms=["youtube_shorts"],
                contentType="AI education",
                targetAudience="beginners",
                visualStyle="futuristic tech visuals",
            )
        )
        self.local_llm = LocalLLMService(LocalLLMSettings(mode="rule_based"))
        self.viral_scoring = ViralScoringService(self.local_llm)
        self.packaging_service = PackagingService(self.local_llm, self.viral_scoring)

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def test_rule_based_packaging_generates_titles_and_thumbnail_concepts(self) -> None:
        result = self.packaging_service.generate(
            self.profile,
            PackagingGenerationRequest(
                script="Most beginners miss this AI habit. Here is the fix.",
                currentTitle="AI Habit",
                topic="AI habits",
                platform="youtube_shorts",
            ),
        )
        self.assertEqual(result.used_llm_mode, "rule_based")
        self.assertGreaterEqual(len(result.titles), 3)
        self.assertGreaterEqual(len(result.thumbnail_concepts), 3)
        self.assertEqual(result.titles[0].title, "AI Habit")
        self.assertTrue(all(candidate.estimated_viral_potential.total >= 0 for candidate in result.titles))
        self.assertTrue(any("AI Habits" in candidate.title for candidate in result.titles))
