import tempfile
import unittest
from pathlib import Path

from backend.src.agents.orchestrator import AgentOrchestrator
from backend.src.config import LocalLLMSettings
from backend.src.domain.models.agent import AgentWorkflowStartRequest
from backend.src.domain.models.analytics import AnalyticsMetrics, ManualPerformanceImportRequest
from backend.src.domain.models.content_profile import ContentProfileCreateRequest
from backend.src.domain.services.analytics_service import AnalyticsService
from backend.src.domain.services.content_profile_service import ContentProfileService
from backend.src.domain.services.content_studio_service import ContentStudioService
from backend.src.domain.services.sqlite_store import SQLiteStore
from backend.src.domain.services.storyboard_service import StoryboardService
from backend.src.domain.services.viral_scoring_service import ViralScoringService
from backend.src.infrastructure.local_llm_service import LocalLLMService


class AgentWorkflowTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)
        self.store = SQLiteStore(str(self.root / "registry.db"))
        self.profile_service = ContentProfileService(self.store)
        self.studio_service = ContentStudioService(self.store)
        self.analytics_service = AnalyticsService(self.store, self.profile_service)
        local_llm = LocalLLMService(LocalLLMSettings(mode="rule_based"))
        self.orchestrator = AgentOrchestrator(
            self.store,
            self.profile_service,
            self.studio_service,
            self.analytics_service,
            StoryboardService(local_llm),
            ViralScoringService(local_llm),
        )
        self.profile = self.profile_service.create_profile(
            ContentProfileCreateRequest(
                name="Daily AI Facts",
                platforms=["youtube_shorts", "tiktok"],
                contentType="AI education",
                targetAudience="beginners",
            )
        )

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def test_content_draft_workflow_persists_runs_and_creates_reviewable_drafts(self) -> None:
        workflow = self.orchestrator.start_workflow(
            AgentWorkflowStartRequest(profileId=self.profile.id, seedPrompt="AI myths")
        )
        self.assertIsNotNone(workflow)
        assert workflow is not None
        self.assertEqual(workflow.status, "completed")
        self.assertEqual(len(workflow.runs), 5)
        self.assertTrue(all(run.status == "completed" for run in workflow.runs))
        self.assertEqual(len(workflow.output_json["createdIdeaIds"]), 3)
        self.assertIsNotNone(workflow.output_json["createdScriptId"])

        stored_workflow = self.orchestrator.get_workflow(workflow.id)
        self.assertIsNotNone(stored_workflow)
        assert stored_workflow is not None
        self.assertEqual([run.agent_name for run in stored_workflow.runs], [
            "profile_strategy_agent",
            "idea_agent",
            "script_agent",
            "storyboard_agent",
            "timeline_agent",
        ])

        ideas = self.studio_service.list_ideas(self.profile.id)
        scripts = self.studio_service.list_scripts(self.profile.id)
        self.assertEqual(len(ideas), 3)
        self.assertEqual(len(scripts), 1)
        self.assertIsNotNone(scripts[0].latest_analysis)

    def test_missing_profile_returns_none(self) -> None:
        workflow = self.orchestrator.start_workflow(
            AgentWorkflowStartRequest(profileId="profile-missing")
        )
        self.assertIsNone(workflow)

    def test_analytics_learning_workflow_persists_rules_for_future_strategy(self) -> None:
        self.analytics_service.import_manual_performance(
            self.profile.id,
            ManualPerformanceImportRequest(
                platform="youtube_shorts",
                title="Short curiosity hook",
                videoLengthSeconds=42,
                hookType="curiosity",
                metrics=AnalyticsMetrics(views=1400, audienceRetentionPercent=78),
            ),
        )
        self.analytics_service.import_manual_performance(
            self.profile.id,
            ManualPerformanceImportRequest(
                platform="youtube_shorts",
                title="Long explanation hook",
                videoLengthSeconds=61,
                hookType="explanation",
                metrics=AnalyticsMetrics(views=800, audienceRetentionPercent=51),
            ),
        )

        workflow = self.orchestrator.start_workflow(
            AgentWorkflowStartRequest(
                profileId=self.profile.id,
                workflowType="analytics_learning",
                createDrafts=False,
            )
        )
        self.assertIsNotNone(workflow)
        assert workflow is not None
        self.assertEqual(workflow.status, "completed")
        self.assertEqual([run.agent_name for run in workflow.runs], [
            "analytics_agent",
            "learning_agent",
        ])
        self.assertTrue(workflow.output_json["learnings"])
        self.assertEqual(
            [rule.rule_key for rule in self.analytics_service.list_profile_rules(self.profile.id)],
            ["preferred_duration_range", "preferred_hook_type"],
        )

        next_workflow = self.orchestrator.start_workflow(
            AgentWorkflowStartRequest(profileId=self.profile.id, seedPrompt="AI myths")
        )
        self.assertIsNotNone(next_workflow)
        assert next_workflow is not None
        strategy = next_workflow.output_json["strategy"]
        self.assertEqual(strategy["hookDirection"], "curiosity")
        self.assertEqual(strategy["targetDurationSeconds"], 42)
        self.assertIn("preferred_duration_range", strategy["appliedLearnings"])


if __name__ == "__main__":
    unittest.main()
