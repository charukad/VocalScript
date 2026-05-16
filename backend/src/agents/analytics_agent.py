from statistics import mean
from typing import Any, Dict, List

from backend.src.agents.base_agent import AgentState, BaseAgent


class AnalyticsAgent(BaseAgent):
    name = "analytics_agent"

    def run(self, state: AgentState) -> Dict[str, Any]:
        performance: List[Dict[str, Any]] = state.get("performance", [])
        if not performance:
            return {
                "performanceSummary": {
                    "count": 0,
                    "averageViews": 0,
                    "averageRetentionPercent": 0,
                    "topContentTitle": None,
                    "bestRetentionTitle": None,
                    "bestHookType": None,
                }
            }

        top_views = max(performance, key=lambda item: item["metrics"]["views"])
        top_retention = max(performance, key=lambda item: item["metrics"]["audienceRetentionPercent"])
        hook_candidates = [
            item for item in performance
            if item.get("hookType") and item["metrics"]["audienceRetentionPercent"] > 0
        ]
        best_hook = max(
            hook_candidates,
            key=lambda item: item["metrics"]["audienceRetentionPercent"],
            default=None,
        )
        return {
            "performanceSummary": {
                "count": len(performance),
                "averageViews": round(mean(item["metrics"]["views"] for item in performance), 2),
                "averageRetentionPercent": round(
                    mean(item["metrics"]["audienceRetentionPercent"] for item in performance),
                    2,
                ),
                "topContentTitle": top_views["title"],
                "bestRetentionTitle": top_retention["title"],
                "bestHookType": best_hook["hookType"] if best_hook else None,
            }
        }
