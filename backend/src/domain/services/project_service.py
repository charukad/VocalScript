import json
import re
import shutil
import uuid
from pathlib import Path
from typing import Any, BinaryIO, Dict, List, Optional

from backend.src.domain.models.project import ProjectDetail, ProjectSummary, utc_now_iso
from backend.src.domain.services.sqlite_store import SQLiteStore


class ProjectService:
    def __init__(self, projects_dir: str, store: Optional[SQLiteStore] = None):
        self.projects_dir = Path(projects_dir)
        self.projects_dir.mkdir(parents=True, exist_ok=True)
        self.registry_file = self.projects_dir / "registry.json"
        self.store = store
        if self.store:
            self._bootstrap_database_from_project_files()

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
        if self.store:
            for project in self.store.list_projects():
                projects_by_id[project.id] = self._summary(project)
        for project_file in self._known_project_files():
            database_project = self._read_project_database(project_file.parent)
            if database_project:
                projects_by_id[database_project.id] = self._summary(database_project)
                continue
            project = self._read_project_file(project_file)
            if project:
                if self.store:
                    self.store.upsert_project(project)
                projects_by_id[project.id] = self._summary(project)
        return sorted(projects_by_id.values(), key=lambda project: project.updated_at, reverse=True)

    def get_project(self, project_id: str) -> Optional[ProjectDetail]:
        if self.store:
            project = self.store.get_project(project_id)
            if project:
                return self._merge_legacy_project_file_state(project)
        project_file = self._find_project_file(project_id)
        if not project_file:
            return None
        project = self._read_project_file(project_file)
        if project and self.store:
            self.store.upsert_project(project)
        return project

    def load_project_from_path(self, path: str) -> Optional[ProjectDetail]:
        project_path = Path(path).expanduser()
        if project_path.is_dir() and (project_path / "project.db").exists() and self.store:
            project = self.store.get_project_from_database_path(project_path / "project.db")
            if project:
                self._write_project(project)
                self._register_project(project)
                return project
        if project_path.is_file() and project_path.name == "project.db" and self.store:
            project = self.store.get_project_from_database_path(project_path)
            if project:
                self._write_project(project)
                self._register_project(project)
                return project
        if project_path.is_file() and project_path.name == "project.json":
            database_project = self._read_project_database(project_path.parent)
            if database_project:
                self._write_project(database_project)
                self._register_project(database_project)
                return database_project
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
                "state": self._sanitize_state(state),
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

    def assets_dir(self, project_id: str) -> Path:
        return self.project_dir(project_id) / "assets"

    def save_asset_file(
        self,
        project_id: str,
        asset_id: str,
        source_filename: str,
        source_stream: BinaryIO,
    ) -> Optional[Dict[str, str]]:
        project = self.get_project(project_id)
        if not project:
            return None
        assets_dir = Path(project.folder_path) / "assets"
        assets_dir.mkdir(parents=True, exist_ok=True)
        filename = self._asset_filename(asset_id, source_filename)
        output_path = assets_dir / filename
        with output_path.open("wb") as output:
            shutil.copyfileobj(source_stream, output)
        return {
            "assetId": asset_id,
            "filename": filename,
            "url": f"/api/projects/{project_id}/assets/{filename}",
            "localPath": str(output_path),
        }

    def resolve_asset_path(self, project_id: str, filename: str) -> Optional[Path]:
        project = self.get_project(project_id)
        if not project:
            return None
        assets_dir = (Path(project.folder_path) / "assets").resolve()
        candidate = (assets_dir / Path(filename).name).resolve()
        if not str(candidate).startswith(str(assets_dir)):
            return None
        if not candidate.exists() or not candidate.is_file():
            return None
        return candidate

    def project_file(self, project_id: str) -> Path:
        return self.project_dir(project_id) / "project.json"

    def _write_project(self, project: ProjectDetail) -> None:
        folder = Path(project.folder_path)
        folder.mkdir(parents=True, exist_ok=True)
        (folder / "assets").mkdir(parents=True, exist_ok=True)
        Path(project.generated_media_path).mkdir(parents=True, exist_ok=True)
        project_file = Path(project.project_file_path or (folder / "project.json"))
        project_file.write_text(
            project.model_dump_json(by_alias=True, indent=2),
            encoding="utf-8",
        )
        if self.store:
            self.store.upsert_project(project)

    def _read_project_file(self, project_file: Path) -> Optional[ProjectDetail]:
        try:
            raw = json.loads(project_file.read_text(encoding="utf-8"))
            return ProjectDetail(**raw)
        except (OSError, json.JSONDecodeError, ValueError):
            return None

    def _merge_legacy_project_file_state(self, project: ProjectDetail) -> ProjectDetail:
        if not self.store or not project.project_file_path:
            return project
        project_file = Path(project.project_file_path)
        file_project = self._read_project_file(project_file)
        if not file_project or file_project.id != project.id:
            return project
        file_state = file_project.state if isinstance(file_project.state, dict) else {}
        database_state = project.state if isinstance(project.state, dict) else {}
        animation_keys = (
            "animationSettings",
            "animationPlan",
            "animationAssetLibrary",
            "animationAssetJobs",
            "currentAnimationBatchId",
        )
        merged_state = dict(database_state)
        changed = False
        for key in animation_keys:
            if file_state.get(key) and not database_state.get(key):
                merged_state[key] = file_state[key]
                changed = True
        if changed:
            merged_project = project.model_copy(update={"state": merged_state})
            self.store.upsert_project(merged_project)
            return merged_project
        return project

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

    def _bootstrap_database_from_project_files(self) -> None:
        for project_file in self._known_project_files():
            if self._read_project_database(project_file.parent):
                continue
            project = self._read_project_file(project_file)
            if project:
                self.store.upsert_project(project)

    def _read_project_database(self, project_dir: Path) -> Optional[ProjectDetail]:
        if not self.store:
            return None
        database_path = project_dir / "project.db"
        if not database_path.exists():
            return None
        return self.store.get_project_from_database_path(database_path)

    def _sanitize_state(self, state: Dict[str, Any]) -> Dict[str, Any]:
        if not isinstance(state, dict):
            return {}
        clean_state = dict(state)
        project = clean_state.get("project")
        if isinstance(project, dict):
            clean_state["project"] = {
                key: project.get(key)
                for key in (
                    "id",
                    "name",
                    "folderPath",
                    "generatedMediaPath",
                    "projectFilePath",
                    "createdAt",
                    "updatedAt",
                )
                if project.get(key) is not None
            }
        try:
            return json.loads(json.dumps(clean_state))
        except (TypeError, ValueError, RecursionError):
            clean_state.pop("project", None)
            return json.loads(json.dumps(clean_state, default=str))

    def _safe_project_id(self, project_id: str) -> str:
        return re.sub(r"[^A-Za-z0-9._-]", "_", project_id) or f"project-{uuid.uuid4().hex[:12]}"

    def _asset_filename(self, asset_id: str, source_filename: str) -> str:
        safe_asset_id = re.sub(r"[^A-Za-z0-9._-]", "_", asset_id) or uuid.uuid4().hex[:12]
        safe_source = re.sub(r"[^A-Za-z0-9._ -]", "_", Path(source_filename or "media").name).strip()
        safe_source = safe_source or "media"
        return f"{safe_asset_id}_{safe_source}"

    def _safe_slug(self, value: str) -> str:
        slug = re.sub(r"[^A-Za-z0-9._-]+", "-", self._clean_name(value).lower()).strip("-")
        return slug or "neuralscribe-project"

    def _clean_name(self, name: str) -> str:
        clean = " ".join((name or "Untitled Project").split())
        return clean[:120] or "Untitled Project"
