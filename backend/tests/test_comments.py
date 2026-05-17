import tempfile
import unittest
from pathlib import Path

from backend.src.domain.models.comments import CommentAnalysisRequest
from backend.src.domain.models.content_profile import ContentProfileCreateRequest
from backend.src.domain.services.comment_analysis_service import CommentAnalysisService
from backend.src.domain.services.content_profile_service import ContentProfileService
from backend.src.domain.services.sqlite_store import SQLiteStore


class CommentAnalysisServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)
        self.store = SQLiteStore(str(self.root / "registry.db"))
        self.profile_service = ContentProfileService(self.store)
        self.service = CommentAnalysisService(self.store)
        self.profile = self.profile_service.create_profile(
            ContentProfileCreateRequest(name="Daily AI Facts", platforms=["youtube_shorts"])
        )

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def test_comment_analysis_persists_questions_requests_and_sentiment(self) -> None:
        run = self.service.analyze(
            self.profile.id,
            CommentAnalysisRequest(
                comments=[
                    "Great video, please explain AI agents next?",
                    "Can you compare AI agents with automations?",
                    "This was helpful and useful.",
                    "AI agents are still confusing.",
                ],
                platform="youtube_shorts",
                sourceLabel="latest video",
            ),
        )
        self.assertEqual(run.summary.total_comments, 4)
        self.assertGreaterEqual(run.summary.sentiment_counts["positive"], 2)
        self.assertEqual(len(run.summary.top_questions), 2)
        self.assertTrue(run.summary.content_requests)
        self.assertEqual(len(self.service.list_runs(self.profile.id)), 1)
