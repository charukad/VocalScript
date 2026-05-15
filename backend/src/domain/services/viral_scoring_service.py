import json
import re
from typing import Any, Dict, List, Optional

from pydantic import ValidationError

from backend.src.domain.models.viral import (
    HookScoreRequest,
    IdeaScoreRequest,
    ScriptAnalysisRequest,
    ScriptAnalysisResponse,
    ScriptRewriteRequest,
    ScriptRewriteResponse,
    ViralPotentialScore,
)
from backend.src.infrastructure.local_llm_service import LocalLLMService


HOOK_WORDS = {
    "why", "what", "how", "secret", "mistake", "stop", "before", "most",
    "never", "nobody", "three", "5", "7", "warning",
}
EMOTION_WORDS = {
    "surprising", "shocking", "love", "hate", "fear", "afraid", "amazing",
    "urgent", "danger", "relief", "excited", "frustrated", "pain",
}
SHARE_WORDS = {"save", "share", "send", "try", "use", "copy", "checklist", "steps"}
CTA_PATTERNS = ("follow", "subscribe", "comment", "save this", "share this", "try this")


class ViralScoringService:
    def __init__(self, local_llm: LocalLLMService):
        self.local_llm = local_llm

    def analyze_script(self, request: ScriptAnalysisRequest) -> ScriptAnalysisResponse:
        llm_payload = self.local_llm.analyze_script_json(self._build_analysis_prompt(request))
        if llm_payload:
            parsed = self._parse_analysis(llm_payload)
            if parsed:
                return parsed.model_copy(update={"used_llm_mode": self.local_llm.settings.mode})
        return self._rule_based_analysis(request)

    def rewrite_script(self, request: ScriptRewriteRequest) -> ScriptRewriteResponse:
        llm_payload = self.local_llm.rewrite_script_json(self._build_rewrite_prompt(request))
        if llm_payload:
            parsed = self._parse_rewrite(llm_payload)
            if parsed:
                return parsed.model_copy(update={"used_llm_mode": self.local_llm.settings.mode})
        rewritten = self._rule_based_rewrite(request.script)
        analysis = self._rule_based_analysis(
            ScriptAnalysisRequest(
                script=rewritten,
                platform=request.platform,
                targetDurationSeconds=request.target_duration_seconds,
            )
        )
        return ScriptRewriteResponse(
            rewrittenScript=rewritten,
            rationale=[
                "Front-loaded the strongest claim.",
                "Shortened sentences for faster pacing.",
                "Added a clearer payoff and call to action.",
            ],
            analysis=analysis,
            usedLlmMode="rule_based",
        )

    def score_idea(self, request: IdeaScoreRequest) -> ViralPotentialScore:
        combined = " ".join(part for part in (request.title, request.hook, request.topic) if part)
        return self._score_text(combined, request.platform, target_duration_seconds=45)

    def score_hook(self, request: HookScoreRequest) -> ViralPotentialScore:
        return self._score_text(request.hook, request.platform, target_duration_seconds=12)

    def _rule_based_analysis(self, request: ScriptAnalysisRequest) -> ScriptAnalysisResponse:
        score = self._score_text(request.script, request.platform, request.target_duration_seconds)
        estimated_duration = self._estimate_duration_seconds(request.script)
        sentences = self._sentences(request.script)
        first_sentence = sentences[0] if sentences else request.script
        average_sentence_words = self._average_sentence_words(sentences)
        improvements: List[str] = []
        if score.hook < 14:
            improvements.append("Open with a sharper curiosity hook or concrete promise.")
        if average_sentence_words > 18:
            improvements.append("Shorten long sentences to improve mobile pacing.")
        if score.shareability < 9:
            improvements.append("Add a practical takeaway viewers may want to save or share.")
        if not self._has_cta(request.script):
            improvements.append("End with a clearer call to action or loop-back payoff.")
        if not improvements:
            improvements.append("Keep the current structure and test a second hook variation.")

        return ScriptAnalysisResponse(
            estimatedViralPotential=score,
            hookStrength=self._band(score.hook, 20),
            retentionRisk="low" if score.retention >= 15 else "medium" if score.retention >= 10 else "high",
            clarity=self._band(score.clarity, 20),
            pacing="fast" if average_sentence_words <= 12 else "balanced" if average_sentence_words <= 18 else "slow",
            curiosityGap="strong" if self._has_curiosity_gap(first_sentence) else "weak",
            emotionalPull=self._band(score.emotion, 15),
            shareability=self._band(score.shareability, 15),
            callToAction="present" if self._has_cta(request.script) else "missing",
            platformFit=self._band(score.platform_fit, 10),
            estimatedDurationSeconds=estimated_duration,
            improvements=improvements,
            usedLlmMode="rule_based",
        )

    def _score_text(
        self,
        text: str,
        platform: Optional[str],
        target_duration_seconds: Optional[int],
    ) -> ViralPotentialScore:
        words = self._words(text)
        sentences = self._sentences(text)
        first_sentence = sentences[0] if sentences else text
        word_set = set(words)
        estimated_duration = self._estimate_duration_seconds(text)
        average_sentence_words = self._average_sentence_words(sentences)

        hook = min(
            20,
            6
            + (5 if self._has_curiosity_gap(first_sentence) else 0)
            + min(5, sum(1 for word in HOOK_WORDS if word in word_set))
            + (4 if any(char.isdigit() for char in first_sentence) else 0),
        )
        retention = max(
            4,
            min(
                20,
                18
                - max(0, average_sentence_words - 14)
                + (2 if len(sentences) >= 3 else 0)
                + (2 if self._has_pattern_interrupt(text) else 0),
            ),
        )
        clarity = max(4, min(20, 20 - max(0, average_sentence_words - 12)))
        emotion = min(15, 5 + min(10, sum(2 for word in EMOTION_WORDS if word in word_set)))
        shareability = min(
            15,
            4
            + min(7, sum(2 for word in SHARE_WORDS if word in word_set))
            + (4 if self._has_cta(text) else 0),
        )
        target = target_duration_seconds or self._default_duration_for_platform(platform)
        platform_fit = max(0, 10 - min(10, abs(estimated_duration - target) // max(1, target // 5 or 1)))
        total = min(100, hook + retention + clarity + emotion + shareability + platform_fit)
        notes: List[str] = []
        if hook >= 16:
            notes.append("Strong curiosity or promise in the opening.")
        else:
            notes.append("Opening could signal the payoff faster.")
        if retention < 12:
            notes.append("Middle section may need faster turns or shorter sentences.")
        if clarity >= 16:
            notes.append("Language is easy to follow on first listen.")
        if shareability < 9:
            notes.append("Add a save-worthy takeaway or more specific viewer benefit.")
        if platform_fit < 7:
            notes.append("Estimated duration is drifting from the target format.")
        return ViralPotentialScore(
            total=total,
            hook=hook,
            retention=retention,
            clarity=clarity,
            emotion=emotion,
            shareability=shareability,
            platformFit=platform_fit,
            notes=notes,
        )

    def _rule_based_rewrite(self, script: str) -> str:
        sentences = self._sentences(script)
        if not sentences:
            return script.strip()
        first = sentences[0]
        hook = first if self._has_curiosity_gap(first) else f"Most people miss this: {first}"
        body = [self._tighten_sentence(sentence) for sentence in sentences[1:]]
        if not self._has_cta(script):
            body.append("Save this so you can use it later.")
        return " ".join([hook, *body]).strip()

    def _parse_analysis(self, payload: str) -> Optional[ScriptAnalysisResponse]:
        try:
            parsed = json.loads(self._extract_json(payload))
            return ScriptAnalysisResponse(**parsed)
        except (json.JSONDecodeError, ValidationError, ValueError):
            return None

    def _parse_rewrite(self, payload: str) -> Optional[ScriptRewriteResponse]:
        try:
            parsed = json.loads(self._extract_json(payload))
            return ScriptRewriteResponse(**parsed)
        except (json.JSONDecodeError, ValidationError, ValueError):
            return None

    def _build_analysis_prompt(self, request: ScriptAnalysisRequest) -> str:
        return (
            "Analyze this social video script. Return strict JSON with keys: "
            "estimatedViralPotential, hookStrength, retentionRisk, clarity, pacing, curiosityGap, "
            "emotionalPull, shareability, callToAction, platformFit, estimatedDurationSeconds, improvements. "
            "estimatedViralPotential must include total, hook, retention, clarity, emotion, shareability, platformFit, notes. "
            f"Platform: {request.platform or 'unspecified'}. "
            f"Target duration seconds: {request.target_duration_seconds or 'unspecified'}.\n"
            f"Script:\n{request.script}"
        )

    def _build_rewrite_prompt(self, request: ScriptRewriteRequest) -> str:
        return (
            "Rewrite this social video script for stronger estimated viral potential without changing the core facts. "
            "Return strict JSON with keys: rewrittenScript, rationale, analysis. "
            "analysis must use the same schema as the script analysis endpoint. "
            f"Goal: {request.goal}\n"
            f"Platform: {request.platform or 'unspecified'}.\n"
            f"Target duration seconds: {request.target_duration_seconds or 'unspecified'}.\n"
            f"Script:\n{request.script}"
        )

    def _extract_json(self, payload: str) -> str:
        start = payload.find("{")
        end = payload.rfind("}")
        return payload[start:end + 1] if start >= 0 and end >= start else payload

    def _sentences(self, text: str) -> List[str]:
        return [item.strip() for item in re.split(r"(?<=[.!?])\s+", text.strip()) if item.strip()]

    def _words(self, text: str) -> List[str]:
        return re.findall(r"[A-Za-z0-9']+", text.lower())

    def _average_sentence_words(self, sentences: List[str]) -> int:
        if not sentences:
            return 0
        return round(sum(len(self._words(sentence)) for sentence in sentences) / len(sentences))

    def _estimate_duration_seconds(self, text: str) -> int:
        return max(1, round(len(self._words(text)) / 2.6))

    def _has_curiosity_gap(self, text: str) -> bool:
        words = set(self._words(text))
        return "?" in text or bool(words & HOOK_WORDS)

    def _has_pattern_interrupt(self, text: str) -> bool:
        lowered = text.lower()
        return any(marker in lowered for marker in ("but ", "however", "instead", "here's the twist", "then"))

    def _has_cta(self, text: str) -> bool:
        lowered = text.lower()
        return any(pattern in lowered for pattern in CTA_PATTERNS)

    def _default_duration_for_platform(self, platform: Optional[str]) -> int:
        if platform in {"youtube_shorts", "facebook_reels", "tiktok", "instagram_reels"}:
            return 45
        return 90

    def _band(self, value: int, maximum: int) -> str:
        ratio = value / maximum if maximum else 0
        if ratio >= 0.8:
            return "strong"
        if ratio >= 0.55:
            return "moderate"
        return "weak"

    def _tighten_sentence(self, sentence: str) -> str:
        words = sentence.split()
        if len(words) <= 18:
            return sentence
        return " ".join(words[:18]).rstrip(",;:") + "."
