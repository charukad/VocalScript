import tempfile
import unittest
from pathlib import Path

from backend.src.domain.models.ab_testing import (
    ExperimentCreateRequest,
    ExperimentUpdateRequest,
    ExperimentVariant,
)
from backend.src.domain.models.analytics import AnalyticsMetrics
from backend.src.domain.models.content_profile import ContentProfileCreateRequest
from backend.src.domain.services.ab_testing_service import ABTestingService
from backend.src.domain.services.content_profile_service import ContentProfileService
from backend.src.domain.services.sqlite_store import SQLiteStore


class ABTestingServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)
        self.store = SQLiteStore(str(self.root / "registry.db"))
        self.profile_service = ContentProfileService(self.store)
        self.ab_testing_service = ABTestingService(self.store)
        self.profile = self.profile_service.create_profile(
            ContentProfileCreateRequest(name="Daily AI Facts")
        )

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def test_experiment_crud_and_winner_tracking(self) -> None:
        created = self.ab_testing_service.create_experiment(
            self.profile.id,
            ExperimentCreateRequest(
                name="Hook framing test",
                platform="youtube_shorts",
                variantA=ExperimentVariant(label="A", title="Most People Miss This About AI"),
                variantB=ExperimentVariant(label="B", title="The AI Mistake Beginners Repeat"),
            ),
        )
        self.assertEqual(len(self.ab_testing_service.list_experiments(self.profile.id)), 1)

        updated = self.ab_testing_service.update_experiment(
            created.id,
            ExperimentUpdateRequest(
                status="completed",
                winnerLabel="B",
                variantB=ExperimentVariant(
                    label="B",
                    title="The AI Mistake Beginners Repeat",
                    metrics=AnalyticsMetrics(views=1400, ctr=5.4),
                ),
            ),
        )
        self.assertIsNotNone(updated)
        self.assertEqual(updated.winner_label, "B")
        self.assertEqual(updated.variant_b.metrics.views, 1400)

        archived = self.ab_testing_service.archive_experiment(created.id)
        self.assertIsNotNone(archived)
        self.assertEqual(archived.status, "archived")
        self.assertEqual(self.ab_testing_service.list_experiments(self.profile.id), [])
