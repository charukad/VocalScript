from typing import Any, Dict

from backend.src.agents.base_agent import AgentState, BaseAgent


class TimelineAgent(BaseAgent):
    name = "timeline_agent"

    def run(self, state: AgentState) -> Dict[str, Any]:
        storyboard = state["storyboard"]
        script = state["script"]
        return {
            "timelineDraft": {
                "status": "placeholder",
                "scriptTitle": script["title"],
                "sceneCount": len(storyboard["scenes"]),
                "requiredInputs": [
                    "approved storyboard scenes",
                    "narration audio",
                    "generated media assets",
                ],
                "message": "Timeline assembly becomes actionable after narration and visual assets exist.",
            }
        }
