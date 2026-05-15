import re
import uuid
from typing import List, Optional

from backend.src.domain.models.content_studio import (
    ContentIdea,
    ContentIdeaCreateRequest,
    ContentIdeaUpdateRequest,
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
