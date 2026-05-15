from typing import Any, Dict

from backend.src.agents.base_agent import AgentState, BaseAgent


class ProfileStrategyAgent(BaseAgent):
    name = "profile_strategy_agent"

    def run(self, state: AgentState) -> Dict[str, Any]:
        profile = state["profile"]
        platforms = profile["platforms"]
        seed_prompt = state.get("seedPrompt", "").strip()
        return {
            "strategy": {
                "primaryPlatform": platforms[0],
                "supportingPlatforms": platforms[1:],
                "contentAngle": seed_prompt or profile["contentType"],
                "targetAudience": profile["targetAudience"],
                "targetDurationSeconds": profile["defaultVideoLengthSeconds"],
                "hookDirection": profile["hookStyle"],
                "tone": profile["tone"],
                "voiceStyle": profile["voiceStyle"],
                "visualStyle": profile["visualStyle"],
            }
        }
