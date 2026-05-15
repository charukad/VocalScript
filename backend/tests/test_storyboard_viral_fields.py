import unittest

from backend.src.config import LocalLLMSettings
from backend.src.domain.models.generation import StoryboardRequest
from backend.src.domain.services.storyboard_service import StoryboardService
from backend.src.infrastructure.local_llm_service import LocalLLMService


class StoryboardViralFieldsTests(unittest.TestCase):
    def test_rule_based_storyboard_populates_visual_planner_fields(self) -> None:
        service = StoryboardService(LocalLLMService(LocalLLMSettings(mode="rule_based")))
        storyboard = service.create_storyboard(
            StoryboardRequest(
                transcript="Most people miss this. Then the simple fix changes everything.",
                preferredVisualType="video",
                sceneDensity="high",
                motionIntensity="dynamic",
            )
        )
        self.assertGreaterEqual(len(storyboard.scenes), 1)
        first_scene = storyboard.scenes[0]
        self.assertEqual(first_scene.scene_goal, "Hook attention immediately")
        self.assertEqual(first_scene.viewer_emotion, "curiosity")
        self.assertTrue(first_scene.visual_hook)
        self.assertTrue(first_scene.motion_style)
        self.assertTrue(first_scene.caption_text)
        self.assertEqual(first_scene.transition, "cut")


if __name__ == "__main__":
    unittest.main()
