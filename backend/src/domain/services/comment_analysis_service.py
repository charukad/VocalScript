import re
import uuid
from collections import Counter, defaultdict
from typing import Dict, List

from backend.src.domain.models.comments import (
    CommentAnalysisRequest,
    CommentAnalysisRun,
    CommentAnalysisSummary,
    CommentTheme,
)
from backend.src.domain.models.project import utc_now_iso
from backend.src.domain.services.sqlite_store import SQLiteStore


POSITIVE_WORDS = {"love", "great", "helpful", "amazing", "good", "useful", "excellent", "thanks"}
NEGATIVE_WORDS = {"bad", "boring", "confusing", "wrong", "hate", "slow", "unclear", "fake"}
STOP_WORDS = {
    "this", "that", "with", "from", "have", "what", "your", "about", "they",
    "them", "there", "would", "could", "should", "video", "really", "please",
}


class CommentAnalysisService:
    def __init__(self, store: SQLiteStore):
        self.store = store

    def analyze(self, profile_id: str, request: CommentAnalysisRequest) -> CommentAnalysisRun:
        comments = request.comments
        sentiment_counts = {"positive": 0, "neutral": 0, "negative": 0}
        theme_examples: Dict[str, List[str]] = defaultdict(list)
        theme_counts: Counter[str] = Counter()
        top_questions = []
        content_requests = []

        for comment in comments:
            tokens = self._tokens(comment)
            positive = sum(token in POSITIVE_WORDS for token in tokens)
            negative = sum(token in NEGATIVE_WORDS for token in tokens)
            sentiment = "positive" if positive > negative else "negative" if negative > positive else "neutral"
            sentiment_counts[sentiment] += 1

            if "?" in comment:
                top_questions.append(comment)
            if re.search(r"\b(make|cover|explain|do|compare)\b", comment, flags=re.IGNORECASE):
                content_requests.append(comment)

            for token in tokens:
                if len(token) < 4 or token in STOP_WORDS:
                    continue
                theme_counts[token] += 1
                if len(theme_examples[token]) < 2:
                    theme_examples[token].append(comment)

        recurring_themes = [
            CommentTheme(label=label, count=count, examples=theme_examples[label])
            for label, count in theme_counts.most_common(5)
            if count > 1
        ]
        actions = self._suggest_actions(sentiment_counts, top_questions, content_requests, recurring_themes)
        now = utc_now_iso()
        run = CommentAnalysisRun(
            id=f"comment-run-{uuid.uuid4().hex[:12]}",
            profileId=profile_id,
            platform=request.platform,
            sourceLabel=request.source_label,
            comments=comments,
            summary=CommentAnalysisSummary(
                totalComments=len(comments),
                sentimentCounts=sentiment_counts,
                recurringThemes=recurring_themes,
                topQuestions=top_questions[:5],
                contentRequests=content_requests[:5],
                suggestedActions=actions,
            ),
            createdAt=now,
            updatedAt=now,
        )
        self.store.upsert_comment_analysis_run(run)
        return run

    def list_runs(self, profile_id: str) -> List[CommentAnalysisRun]:
        return self.store.list_comment_analysis_runs(profile_id)

    def _tokens(self, comment: str) -> list[str]:
        return re.findall(r"[a-zA-Z']+", comment.lower())

    def _suggest_actions(
        self,
        sentiment_counts: dict[str, int],
        top_questions: list[str],
        content_requests: list[str],
        recurring_themes: list[CommentTheme],
    ) -> list[str]:
        actions = []
        if top_questions:
            actions.append("Turn repeated viewer questions into future hooks or follow-up videos.")
        if content_requests:
            actions.append("Use the clearest viewer requests as backlog candidates for the next content batch.")
        if sentiment_counts["negative"] > sentiment_counts["positive"]:
            actions.append("Review unclear moments before repeating this format; negative feedback currently outweighs praise.")
        if recurring_themes:
            actions.append(f"Recurring theme to watch: {recurring_themes[0].label}.")
        if not actions:
            actions.append("Comments are broadly steady; keep collecting more samples before changing strategy.")
        return actions
