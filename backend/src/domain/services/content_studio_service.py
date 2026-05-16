import re
import uuid
from typing import List, Optional

from backend.src.domain.models.content_studio import (
    ContentIdea,
    ContentIdeaCreateRequest,
    ContentIdeaUpdateRequest,
    ContentTrend,
    ContentTrendCreateRequest,
    ContentTrendUpdateRequest,
    NarrationLine,
    NarrationLineCreateRequest,
    NarrationLineUpdateRequest,
    Script,
    ScriptCreateRequest,
    ScriptDetail,
    ScriptSplitLinesRequest,
    ScriptUpdateRequest,
    ScriptVersion,
    ScriptVersionCreateRequest,
)
from backend.src.domain.models.generation import GenerationJob
from backend.src.domain.models.project import utc_now_iso
from backend.src.domain.services.sqlite_store import SQLiteStore


class ContentStudioService:
    def __init__(self, store: SQLiteStore):
        self.store = store

    def create_idea(self, profile_id: str, request: ContentIdeaCreateRequest) -> ContentIdea:
        now = utc_now_iso()
        idea = ContentIdea(
            id=f"idea-{uuid.uuid4().hex[:12]}",
            profileId=profile_id,
            createdAt=now,
            updatedAt=now,
            **request.model_dump(by_alias=True),
        )
        self.store.upsert_content_idea(idea)
        return idea

    def list_ideas(self, profile_id: str, include_archived: bool = False) -> List[ContentIdea]:
        return self.store.list_content_ideas(profile_id, include_archived=include_archived)

    def update_idea(
        self,
        idea_id: str,
        request: ContentIdeaUpdateRequest,
    ) -> Optional[ContentIdea]:
        existing = self.store.get_content_idea(idea_id)
        if not existing:
            return None
        idea = existing.model_copy(
            update={
                **request.model_dump(by_alias=False, exclude_unset=True),
                "updated_at": utc_now_iso(),
            }
        )
        self.store.upsert_content_idea(idea)
        return idea

    def archive_idea(self, idea_id: str) -> Optional[ContentIdea]:
        existing = self.store.get_content_idea(idea_id)
        if not existing:
            return None
        idea = existing.model_copy(update={"status": "archived", "updated_at": utc_now_iso()})
        self.store.upsert_content_idea(idea)
        return idea

    def create_trend(self, profile_id: str, request: ContentTrendCreateRequest) -> ContentTrend:
        now = utc_now_iso()
        trend = ContentTrend(
            id=f"trend-{uuid.uuid4().hex[:12]}",
            profileId=profile_id,
            createdAt=now,
            updatedAt=now,
            **request.model_dump(by_alias=True),
        )
        self.store.upsert_content_trend(trend)
        return trend

    def list_trends(self, profile_id: str, include_archived: bool = False) -> List[ContentTrend]:
        return self.store.list_content_trends(profile_id, include_archived=include_archived)

    def update_trend(
        self,
        trend_id: str,
        request: ContentTrendUpdateRequest,
    ) -> Optional[ContentTrend]:
        existing = self.store.get_content_trend(trend_id)
        if not existing:
            return None
        trend = existing.model_copy(
            update={
                **request.model_dump(by_alias=False, exclude_unset=True),
                "updated_at": utc_now_iso(),
            }
        )
        self.store.upsert_content_trend(trend)
        return trend

    def archive_trend(self, trend_id: str) -> Optional[ContentTrend]:
        existing = self.store.get_content_trend(trend_id)
        if not existing:
            return None
        trend = existing.model_copy(update={"status": "archived", "updated_at": utc_now_iso()})
        self.store.upsert_content_trend(trend)
        return trend

    def suggest_trends(
        self,
        profile_id: str,
        content_type: str,
        target_audience: str,
        platforms: List[str],
        hook_style: str,
    ) -> List[ContentTrend]:
        topic_root = (content_type or "your niche").strip()
        audience = (target_audience or "your audience").strip()
        platform = platforms[0] if platforms else None
        templates = [
            {
                "topic": f"{topic_root} myths people still believe",
                "suggested_angle": f"Challenge a common belief for {audience}.",
                "suggested_hook": f"Most people still get this wrong about {topic_root}.",
            },
            {
                "topic": f"Fastest-growing changes in {topic_root}",
                "suggested_angle": f"Frame the topic as what is changing right now for {audience}.",
                "suggested_hook": f"This part of {topic_root} is moving faster than people realize.",
            },
            {
                "topic": f"{topic_root} mistakes beginners repeat",
                "suggested_angle": f"Use a practical mistake-to-fix structure with a {hook_style or 'curiosity'} opening.",
                "suggested_hook": f"If you are new to {topic_root}, avoid this first.",
            },
        ]
        existing_topics = {
            item.topic.casefold()
            for item in self.list_trends(profile_id, include_archived=True)
        }
        suggestions: List[ContentTrend] = []
        for index, template in enumerate(templates):
            if template["topic"].casefold() in existing_topics:
                continue
            request = ContentTrendCreateRequest(
                topic=template["topic"],
                platform=platform,
                trendScore=max(68, 84 - index * 6),
                platformRelevance=82 - index * 4,
                nicheRelevance=88 - index * 3,
                suggestedAngle=template["suggested_angle"],
                suggestedHook=template["suggested_hook"],
                contentIdeaSuggestions=[
                    f"Short explainer: {template['topic']}",
                    f"Three-point breakdown for {audience}",
                ],
                source="rule_based_fallback",
            )
            suggestions.append(self.create_trend(profile_id, request))
        return suggestions

    def create_script(self, profile_id: str, request: ScriptCreateRequest) -> ScriptDetail:
        now = utc_now_iso()
        script = Script(
            id=f"script-{uuid.uuid4().hex[:12]}",
            profileId=profile_id,
            createdAt=now,
            updatedAt=now,
            **request.model_dump(by_alias=True),
        )
        self.store.upsert_script(script)
        if request.content.strip():
            version = ScriptVersion(
                id=f"script-version-{uuid.uuid4().hex[:12]}",
                scriptId=script.id,
                label="Draft 1",
                content=request.content.strip(),
                isSelected=False,
                createdAt=now,
                updatedAt=now,
            )
            self.store.upsert_script_version(version)
        return self.get_script_detail(script.id)  # type: ignore[return-value]

    def list_scripts(self, profile_id: str) -> List[Script]:
        return self.store.list_scripts(profile_id)

    def get_script_detail(self, script_id: str) -> Optional[ScriptDetail]:
        script = self.store.get_script(script_id)
        if not script:
            return None
        return ScriptDetail(
            **script.model_dump(by_alias=True),
            versions=self.store.list_script_versions(script_id),
            narrationLines=self.store.list_narration_lines(script_id),
        )

    def update_script(self, script_id: str, request: ScriptUpdateRequest) -> Optional[ScriptDetail]:
        existing = self.store.get_script(script_id)
        if not existing:
            return None
        updates = request.model_dump(by_alias=False, exclude_unset=True)
        script = existing.model_copy(update={**updates, "updated_at": utc_now_iso()})
        self.store.upsert_script(script)
        if "final_version_id" in updates:
            self.store.mark_selected_script_version(script.id, script.final_version_id)
        return self.get_script_detail(script.id)

    def create_script_version(
        self,
        script_id: str,
        request: ScriptVersionCreateRequest,
    ) -> Optional[ScriptDetail]:
        script = self.store.get_script(script_id)
        if not script:
            return None
        now = utc_now_iso()
        version = ScriptVersion(
            id=f"script-version-{uuid.uuid4().hex[:12]}",
            scriptId=script_id,
            label=request.label,
            content=request.content,
            isSelected=request.select_as_final,
            createdAt=now,
            updatedAt=now,
        )
        self.store.upsert_script_version(version)
        if request.select_as_final:
            script = script.model_copy(
                update={
                    "final_version_id": version.id,
                    "status": "final",
                    "updated_at": now,
                }
            )
            self.store.upsert_script(script)
            self.store.mark_selected_script_version(script.id, version.id)
        return self.get_script_detail(script_id)

    def split_script_into_lines(
        self,
        script_id: str,
        request: ScriptSplitLinesRequest,
    ) -> Optional[List[NarrationLine]]:
        detail = self.get_script_detail(script_id)
        if not detail:
            return None
        selected_version = next((version for version in detail.versions if version.id == detail.final_version_id), None)
        source_text = (request.text or (selected_version.content if selected_version else detail.content)).strip()
        lines = self._split_text(source_text)
        now = utc_now_iso()
        narration_lines = [
            NarrationLine(
                id=f"narration-line-{uuid.uuid4().hex[:12]}",
                scriptId=script_id,
                index=index,
                text=text,
                status="pending",
                createdAt=now,
                updatedAt=now,
            )
            for index, text in enumerate(lines)
        ]
        self.store.replace_narration_lines(script_id, narration_lines)
        return narration_lines

    def list_narration_lines(self, script_id: str) -> Optional[List[NarrationLine]]:
        if not self.store.get_script(script_id):
            return None
        return self.store.list_narration_lines(script_id)

    def create_narration_line(
        self,
        script_id: str,
        request: NarrationLineCreateRequest,
    ) -> Optional[NarrationLine]:
        if not self.store.get_script(script_id):
            return None
        existing = self.store.list_narration_lines(script_id)
        now = utc_now_iso()
        line = NarrationLine(
            id=f"narration-line-{uuid.uuid4().hex[:12]}",
            scriptId=script_id,
            sceneId=request.scene_id,
            index=request.index if request.index is not None else len(existing),
            text=request.text,
            voiceStyle=request.voice_style,
            emotion=request.emotion,
            speed=request.speed,
            pauseAfterSeconds=request.pause_after_seconds,
            status="pending",
            createdAt=now,
            updatedAt=now,
        )
        self.store.upsert_narration_line(line)
        return line

    def update_narration_line(
        self,
        line_id: str,
        request: NarrationLineUpdateRequest,
    ) -> Optional[NarrationLine]:
        existing = self.store.get_narration_line(line_id)
        if not existing:
            return None
        line = existing.model_copy(
            update={
                **request.model_dump(by_alias=False, exclude_unset=True),
                "updated_at": utc_now_iso(),
            }
        )
        self.store.upsert_narration_line(line)
        return line

    def regenerate_narration_line(self, line_id: str) -> Optional[NarrationLine]:
        existing = self.store.get_narration_line(line_id)
        if not existing:
            return None
        line = existing.model_copy(
            update={
                "status": "pending",
                "error": None,
                "audio_asset_id": None,
                "duration_seconds": None,
                "updated_at": utc_now_iso(),
            }
        )
        self.store.upsert_narration_line(line)
        return line

    def sync_narration_line_from_voice_job(self, job: GenerationJob) -> Optional[NarrationLine]:
        if job.metadata.get("flow") != "voice_generation":
            return None
        line_id = job.metadata.get("narrationLineId")
        if not line_id:
            return None
        existing = self.store.get_narration_line(line_id)
        if not existing:
            return None

        status_by_job = {
            "queued": "pending",
            "running": "generating",
            "completed": "done",
            "failed": "failed",
            "canceled": "failed",
            "manual_action_required": "failed",
        }
        update = {
            "status": status_by_job.get(job.status, existing.status),
            "updated_at": utc_now_iso(),
        }
        if job.status == "completed":
            update.update({
                "audio_asset_id": f"generated-{job.id}",
                "error": None,
            })
            duration = job.metadata.get("durationSeconds")
            if duration is not None:
                try:
                    update["duration_seconds"] = float(duration)
                except (TypeError, ValueError):
                    pass
        elif job.status in ("failed", "canceled", "manual_action_required"):
            update.update({
                "audio_asset_id": None,
                "duration_seconds": None,
                "error": job.error or job.metadata.get("providerError") or job.status.replace("_", " "),
            })

        line = existing.model_copy(update=update)
        self.store.upsert_narration_line(line)
        return line

    def _split_text(self, text: str) -> List[str]:
        if not text:
            return []
        lines: List[str] = []
        for paragraph in [item.strip() for item in text.splitlines() if item.strip()]:
            lines.extend(
                item.strip()
                for item in re.split(r"(?<=[.!?])\s+", paragraph)
                if item.strip()
            )
        return lines or [text.strip()]
