import unittest

from backend.src.config import LocalLLMSettings
from backend.src.domain.models.viral import (
    HookScoreRequest,
    IdeaScoreRequest,
    ScriptAnalysisRequest,
    ScriptRewriteRequest,
)
from backend.src.domain.services.viral_scoring_service import ViralScoringService
from backend.src.infrastructure.local_llm_service import LocalLLMService


class ViralScoringTests(unittest.TestCase):
    def setUp(self) -> None:
        self.service = ViralScoringService(LocalLLMService(LocalLLMSettings(mode="rule_based")))

    def test_rule_based_analysis_returns_structured_score(self) -> None:
        analysis = self.service.analyze_script(
            ScriptAnalysisRequest(
                script="Most people miss this shortcut. Here is the twist. Save this so you can try it later.",
                platform="youtube_shorts",
                targetDurationSeconds=30,
            )
        )
        self.assertEqual(analysis.used_llm_mode, "rule_based")
        self.assertGreaterEqual(analysis.estimated_viral_potential.total, 0)
        self.assertLessEqual(analysis.estimated_viral_potential.total, 100)
        self.assertEqual(analysis.call_to_action, "present")

    def test_rule_based_rewrite_adds_hook_and_cta_when_missing(self) -> None:
        rewrite = self.service.rewrite_script(
            ScriptRewriteRequest(script="AI tools are changing classrooms. They help students practice faster.")
        )
        self.assertEqual(rewrite.used_llm_mode, "rule_based")
        self.assertIn("Most people miss this:", rewrite.rewritten_script)
        self.assertIn("Save this", rewrite.rewritten_script)

    def test_idea_and_hook_scores_are_available(self) -> None:
        idea_score = self.service.score_idea(
            IdeaScoreRequest(title="Three AI mistakes", hook="Most creators miss the third one.")
        )
        hook_score = self.service.score_hook(HookScoreRequest(hook="Why does this work so well?"))
        self.assertGreater(idea_score.total, 0)
        self.assertGreater(hook_score.hook, 0)


if __name__ == "__main__":
    unittest.main()
