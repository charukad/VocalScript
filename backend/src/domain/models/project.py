from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from pydantic import Field

from backend.src.domain.models.generation import ApiModel


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class ProjectSummary(ApiModel):
    id: str
    name: str
    folder_path: str = Field(alias="folderPath")
    generated_media_path: str = Field(alias="generatedMediaPath")
    project_file_path: str = Field(default="", alias="projectFilePath")
    created_at: str = Field(alias="createdAt")
    updated_at: str = Field(alias="updatedAt")


class ProjectCreateRequest(ApiModel):
    name: str = "Untitled Project"
    parent_directory: Optional[str] = Field(default=None, alias="parentDirectory")


class ProjectLoadRequest(ApiModel):
    path: str


class ProjectDirectoryResponse(ApiModel):
    path: str


class ProjectAssetResponse(ApiModel):
    asset_id: str = Field(alias="assetId")
    filename: str
    url: str
    local_path: str = Field(alias="localPath")


class ProjectSaveRequest(ApiModel):
    name: Optional[str] = None
    state: Dict[str, Any] = Field(default_factory=dict)


class ProjectDetail(ProjectSummary):
    state: Dict[str, Any] = Field(default_factory=dict)


class ProjectListResponse(ApiModel):
    projects: List[ProjectSummary]
