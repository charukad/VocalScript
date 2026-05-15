from typing import Any, Dict

from backend.src.agents.base_agent import AgentState, BaseAgent
from backend.src.domain.models.generation import StoryboardRequest
from backend.src.domain.services.storyboard_service import StoryboardService


class StoryboardAgent(BaseAgent):
    name = "storyboard_agent"

    def __init__(self, storyboard_service: StoryboardService):
        self.storyboard_service = storyboard_service

    def run(self, state: AgentState) -> Dict[str, Any]:
        profile = state["profile"]
        script = state["script"]
        storyboard = self.storyboard_service.create_storyboard(
            StoryboardRequest(
                transcript=script["content"],
                style=profile["visualStyle"],
                preferredVisualType="video",
                sceneDensity="high",
                motionIntensity="dynamic",
                promptDetail="balanced",
            )
        )
        return {"storyboard": storyboard.model_dump(by_alias=True)}
