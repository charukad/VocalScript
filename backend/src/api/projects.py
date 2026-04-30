import subprocess

from fastapi import APIRouter, HTTPException

from backend.src.domain.models.project import (
    ProjectCreateRequest,
    ProjectDirectoryResponse,
    ProjectDetail,
    ProjectLoadRequest,
    ProjectListResponse,
    ProjectSaveRequest,
)
from backend.src.domain.services.project_service import ProjectService


def build_projects_router(project_service: ProjectService) -> APIRouter:
    router = APIRouter(prefix="/api/projects", tags=["projects"])

    @router.post("", response_model=ProjectDetail)
    async def create_project(request: ProjectCreateRequest):
        return project_service.create_project(request.name, request.parent_directory)

    @router.get("", response_model=ProjectListResponse)
    async def list_projects():
        return ProjectListResponse(projects=project_service.list_projects())

    @router.post("/select-directory", response_model=ProjectDirectoryResponse)
    async def select_project_directory():
        try:
            completed = subprocess.run(
                [
                    "osascript",
                    "-e",
                    'POSIX path of (choose folder with prompt "Choose where NeuralScribe should create the project folder")',
                ],
                check=False,
                capture_output=True,
                text=True,
                timeout=300,
            )
        except (OSError, subprocess.TimeoutExpired) as exc:
            raise HTTPException(status_code=500, detail=f"Directory picker failed: {exc}")
        if completed.returncode != 0:
            detail = completed.stderr.strip() or "Directory selection canceled"
            raise HTTPException(status_code=400, detail=detail)
        path = completed.stdout.strip()
        if not path:
            raise HTTPException(status_code=400, detail="Directory selection canceled")
        return ProjectDirectoryResponse(path=path)

    @router.post("/load", response_model=ProjectDetail)
    async def load_project(request: ProjectLoadRequest):
        project = project_service.load_project_from_path(request.path)
        if not project:
            raise HTTPException(status_code=404, detail="Project file not found")
        return project

    @router.get("/{project_id}", response_model=ProjectDetail)
    async def get_project(project_id: str):
        project = project_service.get_project(project_id)
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        return project

    @router.put("/{project_id}", response_model=ProjectDetail)
    async def save_project(project_id: str, request: ProjectSaveRequest):
        project = project_service.save_project(project_id, request.name, request.state)
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        return project

    return router
