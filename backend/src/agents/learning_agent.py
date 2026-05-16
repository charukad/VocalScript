from statistics import mean
from typing import Any, Dict, List

from backend.src.agents.base_agent import AgentState, BaseAgent


class LearningAgent(BaseAgent):
    name = "learning_agent"

    def run(self, state: AgentState) -> Dict[str, Any]:
        performance: List[Dict[str, Any]] = state.get("performance", [])
        if not performance:
            return {"learnings": [], "rules": []}

        learnings: List[Dict[str, Any]] = []
        rules: List[Dict[str, Any]] = []
        duration_samples = [
            item for item in performance
            if item.get("videoLengthSeconds") is not None
            and item["metrics"]["audienceRetentionPercent"] > 0
        ]
        if duration_samples:
            strongest = sorted(
                duration_samples,
                key=lambda item: item["metrics"]["audienceRetentionPercent"],
                reverse=True,
            )[: max(1, len(duration_samples) // 2)]
            lengths = [float(item["videoLengthSeconds"]) for item in strongest]
            min_length = round(min(lengths))
            max_length = round(max(lengths))
            summary = f"Best recent retention came from videos around {min_length}-{max_length} seconds."
            learnings.append({
                "learningType": "duration",
                "summary": summary,
                "data": {"minSeconds": min_length, "maxSeconds": max_length},
            })
            rules.append({
                "ruleKey": "preferred_duration_range",
                "ruleJson": {"minSeconds": min_length, "maxSeconds": max_length},
            })

        hook_samples = [
            item for item in performance
            if item.get("hookType") and item["metrics"]["audienceRetentionPercent"] > 0
        ]
        if hook_samples:
            grouped: Dict[str, List[float]] = {}
            for item in hook_samples:
                grouped.setdefault(item["hookType"], []).append(
                    float(item["metrics"]["audienceRetentionPercent"])
                )
            best_hook, scores = max(grouped.items(), key=lambda pair: mean(pair[1]))
            summary = f"{best_hook} hooks currently produce the strongest average retention."
            learnings.append({
                "learningType": "hook",
                "summary": summary,
                "data": {"hookType": best_hook, "averageRetentionPercent": round(mean(scores), 2)},
            })
            rules.append({
                "ruleKey": "preferred_hook_type",
                "ruleJson": {"hookType": best_hook},
            })

        average_retention = round(
            mean(item["metrics"]["audienceRetentionPercent"] for item in performance),
            2,
        )
        learnings.append({
            "learningType": "baseline",
            "summary": f"Recent average retention is {average_retention}%.",
            "data": {"averageRetentionPercent": average_retention},
        })
        return {"learnings": learnings, "rules": rules}
