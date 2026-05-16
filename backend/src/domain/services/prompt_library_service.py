import uuid
from typing import List, Optional

from backend.src.domain.models.project import utc_now_iso
from backend.src.domain.models.prompt_library import (
    PromptTemplate,
    PromptTemplateCreateRequest,
    PromptTemplateUpdateRequest,
)
from backend.src.domain.services.sqlite_store import SQLiteStore


class PromptLibraryService:
    def __init__(self, store: SQLiteStore):
        self.store = store

    def create_template(
        self,
        profile_id: str,
        request: PromptTemplateCreateRequest,
    ) -> PromptTemplate:
        now = utc_now_iso()
        template = PromptTemplate(
            id=f"prompt-template-{uuid.uuid4().hex[:12]}",
            profileId=profile_id,
            createdAt=now,
            updatedAt=now,
            **request.model_dump(by_alias=True),
        )
        self.store.upsert_prompt_template(template)
        return template

    def list_templates(
        self,
        profile_id: str,
        include_archived: bool = False,
    ) -> List[PromptTemplate]:
        return self.store.list_prompt_templates(profile_id, include_archived=include_archived)

    def update_template(
        self,
        template_id: str,
        request: PromptTemplateUpdateRequest,
    ) -> Optional[PromptTemplate]:
        existing = self.store.get_prompt_template(template_id)
        if not existing:
            return None
        template = existing.model_copy(
            update={
                **request.model_dump(by_alias=False, exclude_unset=True),
                "updated_at": utc_now_iso(),
            }
        )
        self.store.upsert_prompt_template(template)
        return template

    def archive_template(self, template_id: str) -> Optional[PromptTemplate]:
        existing = self.store.get_prompt_template(template_id)
        if not existing:
            return None
        template = existing.model_copy(update={"status": "archived", "updated_at": utc_now_iso()})
        self.store.upsert_prompt_template(template)
        return template
