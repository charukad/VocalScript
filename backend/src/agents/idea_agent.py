from typing import Any, Dict, List

from backend.src.agents.base_agent import AgentState, BaseAgent


class IdeaAgent(BaseAgent):
    name = "idea_agent"

    def run(self, state: AgentState) -> Dict[str, Any]:
        profile = state["profile"]
        strategy = state["strategy"]
        angle = strategy["contentAngle"]
        platform = strategy["primaryPlatform"]
        duration = strategy["targetDurationSeconds"]
        hooks = [
            f"Most people miss this about {angle}.",
            f"Before you try {angle}, know this.",
            f"Three fast lessons about {angle}.",
        ]
        titles = [
            f"The overlooked truth about {angle}",
            f"What beginners get wrong about {angle}",
            f"Three quick wins for {angle}",
        ]
        ideas: List[Dict[str, Any]] = []
        for index, title in enumerate(titles):
            ideas.append(
                {
                    "title": title,
                    "topic": angle,
                    "platform": platform,
                    "hook": hooks[index],
                    "difficulty": "medium" if index == 0 else "easy",
                    "targetDurationSeconds": duration,
                    "suggestedVisualStyle": profile["visualStyle"],
                    "reasonItMayWork": (
                        "Clear promise, quick payoff, and a familiar short-form structure."
                    ),
                    "status": "draft",
                }
            )
        return {"ideas": ideas}
