import json
import re
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

from backend.src.domain.models.project import ProjectDetail, ProjectSummary, utc_now_iso


class ProjectService:
    def __init__(self, projects_dir: str):
        self.projects_dir = Path(projects_dir)
        self.projects_dir.mkdir(parents=True, exist_ok=True)
        self.registry_file = self.projects_dir / "registry.json"

    def create_project(self, name: str, parent_directory: Optional[str] = None) -> ProjectDetail:
        project_id = f"project-{uuid.uuid4().hex[:12]}"
        now = utc_now_iso()
        project_dir = self._new_project_dir(project_id, name, parent_directory)
        project = ProjectDetail(
            id=project_id,
            name=self._clean_name(name),
            folderPath=str(project_dir),
            generatedMediaPath=str(project_dir / "generated"),
            projectFilePath=str(project_dir / "project.json"),
            createdAt=now,
            updatedAt=now,
            state={},
        )
        self._write_project(project)
        self._register_project(project)
        return project

    def list_projects(self) -> List[ProjectSummary]:
        projects_by_id: Dict[str, ProjectSummary] = {}
        for project_file in self._known_project_files():
            project = self._read_project_file(project_file)
            if project:
                projects_by_id[project.id] = self._summary(project)
        return sorted(projects_by_id.values(), key=lambda project: project.updated_at, reverse=True)

    def get_project(self, project_id: str) -> Optional[ProjectDetail]:
        project_file = self._find_project_file(project_id)
        if not project_file:
            return None
        return self._read_project_file(project_file)

    def load_project_from_path(self, path: str) -> Optional[ProjectDetail]:
        project_path = Path(path).expanduser()
        if project_path.is_dir():
            project_path = project_path / "project.json"
        if not project_path.exists():
            return None
        project = self._read_project_file(project_path)
        if not project:
            return None
        normalized = project.model_copy(
            update={
                "folder_path": str(project_path.parent),
                "generated_media_path": str(project_path.parent / "generated"),
                "project_file_path": str(project_path),
            }
        )
        self._write_project(normalized)
        self._register_project(normalized)
        return normalized

    def save_project(self, project_id: str, name: Optional[str], state: Dict[str, Any]) -> Optional[ProjectDetail]:
        existing = self.get_project(project_id)
        if not existing:
            return None
        project = existing.model_copy(
            update={
                "name": self._clean_name(name or existing.name),
                "updated_at": utc_now_iso(),
                "state": state,
            }
        )
        self._write_project(project)
        self._register_project(project)
        return project

    def project_dir(self, project_id: str) -> Path:
        existing = self.get_project(project_id)
        if existing:
            return Path(existing.folder_path)
        return self.projects_dir / self._safe_project_id(project_id)

    def generated_media_dir(self, project_id: str) -> Path:
        return self.project_dir(project_id) / "generated"

    def project_file(self, project_id: str) -> Path:
        return self.project_dir(project_id) / "project.json"

    def _write_project(self, project: ProjectDetail) -> None:
        folder = Path(project.folder_path)
        folder.mkdir(parents=True, exist_ok=True)
        Path(project.generated_media_path).mkdir(parents=True, exist_ok=True)
        project_file = Path(project.project_file_path or (folder / "project.json"))
        project_file.write_text(
            project.model_dump_json(by_alias=True, indent=2),
            encoding="utf-8",
        )

    def _read_project_file(self, project_file: Path) -> Optional[ProjectDetail]:
        try:
            raw = json.loads(project_file.read_text(encoding="utf-8"))
            return ProjectDetail(**raw)
        except (OSError, json.JSONDecodeError, ValueError):
            return None

    def _summary(self, project: ProjectDetail) -> ProjectSummary:
        return ProjectSummary(
            id=project.id,
            name=project.name,
            folderPath=project.folder_path,
            generatedMediaPath=project.generated_media_path,
            projectFilePath=project.project_file_path,
            createdAt=project.created_at,
            updatedAt=project.updated_at,
        )

    def _new_project_dir(self, project_id: str, name: str, parent_directory: Optional[str]) -> Path:
        if parent_directory:
            parent = Path(parent_directory).expanduser()
            folder_name = f"{self._safe_slug(name)}-{project_id.removeprefix('project-')[:8]}"
            return parent / folder_name
        return self.projects_dir / self._safe_project_id(project_id)

    def _known_project_files(self) -> List[Path]:
        files = list(self.projects_dir.glob("*/project.json"))
        for raw_path in self._read_registry():
            path = Path(raw_path).expanduser()
            if path.exists():
                files.append(path)
        return files

    def _find_project_file(self, project_id: str) -> Optional[Path]:
        default_file = self.projects_dir / self._safe_project_id(project_id) / "project.json"
        if default_file.exists():
            return default_file
        for project_file in self._known_project_files():
            project = self._read_project_file(project_file)
            if project and project.id == project_id:
                return project_file
        return None

    def _read_registry(self) -> List[str]:
        try:
            raw = json.loads(self.registry_file.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return []
        if not isinstance(raw, dict):
            return []
        project_files = raw.get("projectFiles")
        if not isinstance(project_files, list):
            return []
        return [str(path) for path in project_files]

    def _register_project(self, project: ProjectDetail) -> None:
        project_files = set(self._read_registry())
        project_files.add(project.project_file_path or str(Path(project.folder_path) / "project.json"))
        self.registry_file.write_text(
            json.dumps({"projectFiles": sorted(project_files)}, indent=2),
            encoding="utf-8",
        )

    def _safe_project_id(self, project_id: str) -> str:
        return re.sub(r"[^A-Za-z0-9._-]", "_", project_id) or f"project-{uuid.uuid4().hex[:12]}"

    def _safe_slug(self, value: str) -> str:
        slug = re.sub(r"[^A-Za-z0-9._-]+", "-", self._clean_name(value).lower()).strip("-")
        return slug or "neuralscribe-project"

    def _clean_name(self, name: str) -> str:
        clean = " ".join((name or "Untitled Project").split())
        return clean[:120] or "Untitled Project"
