from typing import Any, Dict

from backend.src.agents.base_agent import AgentState, BaseAgent


class ProfileStrategyAgent(BaseAgent):
    name = "profile_strategy_agent"

    def run(self, state: AgentState) -> Dict[str, Any]:
        profile = state["profile"]
        platforms = profile["platforms"]
        seed_prompt = state.get("seedPrompt", "").strip()
        rules = {
            rule["ruleKey"]: rule["ruleJson"]
            for rule in state.get("profileRules", [])
        }
        duration_rule = rules.get("preferred_duration_range", {})
        preferred_hook = rules.get("preferred_hook_type", {}).get("hookType")
        default_duration = profile["defaultVideoLengthSeconds"]
        if duration_rule:
            default_duration = round(
                (duration_rule.get("minSeconds", default_duration) + duration_rule.get("maxSeconds", default_duration)) / 2
            )
        return {
            "strategy": {
                "primaryPlatform": platforms[0],
                "supportingPlatforms": platforms[1:],
                "contentAngle": seed_prompt or profile["contentType"],
                "targetAudience": profile["targetAudience"],
                "targetDurationSeconds": default_duration,
                "hookDirection": preferred_hook or profile["hookStyle"],
                "tone": profile["tone"],
                "voiceStyle": profile["voiceStyle"],
                "visualStyle": profile["visualStyle"],
                "appliedLearnings": list(rules.keys()),
            }
        }
