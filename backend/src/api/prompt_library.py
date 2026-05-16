from fastapi import APIRouter, HTTPException, Query

from backend.src.domain.models.prompt_library import (
    PromptTemplate,
    PromptTemplateCreateRequest,
    PromptTemplateListResponse,
    PromptTemplateUpdateRequest,
)
from backend.src.domain.services.content_profile_service import ContentProfileService
from backend.src.domain.services.prompt_library_service import PromptLibraryService


def build_prompt_library_router(
    content_profile_service: ContentProfileService,
    prompt_library_service: PromptLibraryService,
) -> APIRouter:
    router = APIRouter(tags=["prompt-library"])

    def require_profile(profile_id: str):
        profile = content_profile_service.get_profile(profile_id)
        if not profile or profile.is_archived:
            raise HTTPException(status_code=404, detail="Content profile not found")
        return profile

    @router.get(
        "/api/content-profiles/{profile_id}/prompt-templates",
        response_model=PromptTemplateListResponse,
    )
    async def list_prompt_templates(
        profile_id: str,
        include_archived: bool = Query(False, alias="includeArchived"),
    ):
        require_profile(profile_id)
        return PromptTemplateListResponse(
            templates=prompt_library_service.list_templates(profile_id, include_archived=include_archived)
        )

    @router.post(
        "/api/content-profiles/{profile_id}/prompt-templates",
        response_model=PromptTemplate,
    )
    async def create_prompt_template(
        profile_id: str,
        request: PromptTemplateCreateRequest,
    ):
        require_profile(profile_id)
        return prompt_library_service.create_template(profile_id, request)

    @router.put("/api/prompt-templates/{template_id}", response_model=PromptTemplate)
    async def update_prompt_template(
        template_id: str,
        request: PromptTemplateUpdateRequest,
    ):
        template = prompt_library_service.update_template(template_id, request)
        if not template:
            raise HTTPException(status_code=404, detail="Prompt template not found")
        return template

    @router.delete("/api/prompt-templates/{template_id}", response_model=PromptTemplate)
    async def archive_prompt_template(template_id: str):
        template = prompt_library_service.archive_template(template_id)
        if not template:
            raise HTTPException(status_code=404, detail="Prompt template not found")
        return template

    return router
