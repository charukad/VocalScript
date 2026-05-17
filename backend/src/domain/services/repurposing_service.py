import re

from backend.src.domain.models.content_profile import ContentProfile
from backend.src.domain.models.repurposing import (
    RepurposeCandidate,
    RepurposeRequest,
    RepurposeResponse,
)


class RepurposingService:
    def generate(self, profile: ContentProfile, request: RepurposeRequest) -> RepurposeResponse:
        sentences = self._split_sentences(request.transcript)
        if not sentences:
            return RepurposeResponse(candidates=[])
        words_per_second = 2.5
        target_words = max(20, round(request.target_duration_seconds * words_per_second))
        windows = []
        for start in range(len(sentences)):
            words = 0
            selected = []
            for end in range(start, len(sentences)):
                selected.append(sentences[end])
                words += len(sentences[end].split())
                if words >= target_words or end == len(sentences) - 1:
                    windows.append((start, end, " ".join(selected), words))
                    break
        scored = sorted(
            windows,
            key=lambda item: self._score_window(item[2]),
            reverse=True,
        )
        candidates = []
        used = set()
        for start, end, excerpt, words in scored:
            if len(candidates) >= request.max_candidates:
                break
            signature = excerpt.casefold()
            if signature in used:
                continue
            used.add(signature)
            first_sentence = sentences[start]
            estimated = max(10, round(words / words_per_second))
            candidates.append(
                RepurposeCandidate(
                    title=self._title_from_excerpt(first_sentence, profile),
                    hook=first_sentence,
                    excerpt=excerpt,
                    startSentence=start + 1,
                    endSentence=end + 1,
                    estimatedDurationSeconds=estimated,
                    reason=self._reason(excerpt),
                )
            )
        return RepurposeResponse(candidates=candidates)

    def _split_sentences(self, transcript: str) -> list[str]:
        return [item.strip() for item in re.split(r"(?<=[.!?])\s+", transcript.strip()) if item.strip()]

    def _score_window(self, text: str) -> int:
        lowered = text.lower()
        score = 0
        for marker in ("?", "why", "mistake", "secret", "change", "never", "most people", "here's"):
            if marker in lowered:
                score += 2
        score += min(5, text.count("!"))
        return score

    def _title_from_excerpt(self, sentence: str, profile: ContentProfile) -> str:
        clean = sentence.rstrip(".!?")
        if len(clean) > 72:
            clean = clean[:69].rstrip() + "..."
        return clean or f"{profile.content_type or 'Short'} highlight"

    def _reason(self, excerpt: str) -> str:
        score = self._score_window(excerpt)
        if score >= 4:
            return "Contains a strong curiosity or contrast cue suited to short-form extraction."
        if score >= 2:
            return "Has a clear opening thought that can become a standalone short."
        return "Forms a coherent short segment with enough context to test."
