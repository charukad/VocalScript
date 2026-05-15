from typing import Any, Dict

from backend.src.agents.base_agent import AgentState, BaseAgent


class ScriptAgent(BaseAgent):
    name = "script_agent"

    def run(self, state: AgentState) -> Dict[str, Any]:
        profile = state["profile"]
        strategy = state["strategy"]
        idea = state["ideas"][0]
        topic = idea["topic"]
        script = " ".join(
            [
                idea["hook"],
                f"Here is the quick version for {profile['targetAudience']}.",
                f"First, focus on the one part of {topic} that changes the outcome fastest.",
                "Second, make the example concrete enough to picture in one glance.",
                "Finally, end with one takeaway viewers can use immediately.",
                "Save this if you want a fast reference later.",
            ]
        )
        return {
            "script": {
                "title": idea["title"],
                "content": script,
                "platform": strategy["primaryPlatform"],
                "targetDurationSeconds": strategy["targetDurationSeconds"],
                "tone": strategy["tone"],
            }
        }
