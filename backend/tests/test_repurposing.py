import tempfile
import unittest
from pathlib import Path

from backend.src.domain.models.content_profile import ContentProfileCreateRequest
from backend.src.domain.models.repurposing import RepurposeRequest
from backend.src.domain.services.content_profile_service import ContentProfileService
from backend.src.domain.services.repurposing_service import RepurposingService
from backend.src.domain.services.sqlite_store import SQLiteStore


class RepurposingServiceTests(unittest.TestCase):
    def test_repurposing_generates_short_candidates(self) -> None:
        service = RepurposingService()
        with tempfile.TemporaryDirectory() as temp_dir:
            store = SQLiteStore(str(Path(temp_dir) / "registry.db"))
            profile = ContentProfileService(store).create_profile(
                ContentProfileCreateRequest(name="Daily AI Facts", platforms=["youtube_shorts"], contentType="AI")
            )
        result = service.generate(
            profile,
            RepurposeRequest(
                sourceTitle="Long AI explainer",
                transcript=(
                    "Most people miss the biggest AI shift happening right now. "
                    "The real change is agents that can chain tools together. "
                    "Why does that matter? Because workflows stop being one prompt at a time. "
                    "Here is what beginners should watch first."
                ),
                targetDurationSeconds=25,
                maxCandidates=3,
            ),
        )
        self.assertTrue(result.candidates)
        self.assertIn("Most people", result.candidates[0].hook)
