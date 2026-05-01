import json
import sqlite3
import threading
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

from backend.src.domain.models.generation import (
    GeneratedMediaAsset,
    GenerationJob,
    GenerationJobStatus,
    GenerationMediaVariant,
    ProviderName,
)
from backend.src.domain.models.project import ProjectDetail, ProjectSummary


RUNNING_JOB_TIMEOUT_SECONDS = 900
PROJECT_DATABASE_NAME = "project.db"


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _utc_now_iso() -> str:
    return _utc_now().isoformat()


def _json_dumps(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def _json_loads(value: Optional[str], fallback: Any) -> Any:
    if value is None or value == "":
        return fallback
    try:
        return json.loads(value)
    except (TypeError, ValueError, json.JSONDecodeError):
        return fallback


def _parse_iso(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        return None


class SQLiteStore:
    """SQLite source of truth for project data.

    The app keeps a small registry database under the application projects
    directory, while each real project owns a portable project.db inside the
    project folder.
    """

    def __init__(self, registry_database_path: str, legacy_database_path: Optional[str] = None):
        self.registry_database_path = Path(registry_database_path)
        self.registry_database_path.parent.mkdir(parents=True, exist_ok=True)
        self.legacy_database_path = Path(legacy_database_path) if legacy_database_path else None
        self._lock = threading.RLock()
        self._initialize_registry()

    def project_database_path(self, project: ProjectDetail | ProjectSummary | sqlite3.Row) -> Path:
        if isinstance(project, sqlite3.Row):
            database_path = project["database_path"] if "database_path" in project.keys() else None
            folder_path = project["folder_path"]
        else:
            database_path = getattr(project, "database_path", None)
            folder_path = project.folder_path
        return Path(database_path) if database_path else Path(folder_path) / PROJECT_DATABASE_NAME

    def _registry_connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.registry_database_path)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        return connection

    def _project_connect(self, database_path: Path) -> sqlite3.Connection:
        database_path.parent.mkdir(parents=True, exist_ok=True)
        connection = sqlite3.connect(database_path)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        return connection

    def _initialize_registry(self) -> None:
        with self._lock, self._registry_connect() as connection:
            connection.execute("PRAGMA journal_mode = WAL")
            connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS schema_migrations (
                    version INTEGER PRIMARY KEY,
                    applied_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS registry_projects (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    folder_path TEXT NOT NULL,
                    generated_media_path TEXT NOT NULL,
                    project_file_path TEXT NOT NULL,
                    database_path TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    last_opened_at TEXT NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_registry_projects_updated
                    ON registry_projects(updated_at DESC);

                INSERT OR IGNORE INTO schema_migrations(version, applied_at)
                VALUES (1, CURRENT_TIMESTAMP);
                """
            )

    def _initialize_project_database(self, connection: sqlite3.Connection) -> None:
        connection.execute("PRAGMA journal_mode = WAL")
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS schema_migrations (
                version INTEGER PRIMARY KEY,
                applied_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS projects (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                folder_path TEXT NOT NULL,
                generated_media_path TEXT NOT NULL,
                project_file_path TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS project_settings (
                key TEXT PRIMARY KEY,
                value_json TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS media_assets (
                id TEXT PRIMARY KEY,
                type TEXT NOT NULL,
                media_kind TEXT NOT NULL,
                source_url TEXT,
                local_path TEXT,
                file_name TEXT,
                file_type TEXT,
                file_size INTEGER,
                checksum TEXT,
                asset_json TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS timeline_tracks (
                id TEXT PRIMARY KEY,
                order_index INTEGER NOT NULL,
                type TEXT NOT NULL,
                name TEXT NOT NULL,
                muted INTEGER NOT NULL DEFAULT 0,
                solo INTEGER NOT NULL DEFAULT 0,
                locked INTEGER NOT NULL DEFAULT 0,
                track_json TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS timeline_clips (
                id TEXT PRIMARY KEY,
                asset_id TEXT NOT NULL,
                track_id TEXT NOT NULL,
                type TEXT NOT NULL,
                start_time REAL NOT NULL,
                duration REAL NOT NULL,
                media_offset REAL NOT NULL DEFAULT 0,
                file_name TEXT,
                file_type TEXT,
                file_size INTEGER,
                generation_job_id TEXT,
                generation_scene_id TEXT,
                clip_json TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_timeline_clips_track_start
                ON timeline_clips(track_id, start_time);

            CREATE TABLE IF NOT EXISTS clip_keyframes (
                id TEXT PRIMARY KEY,
                clip_id TEXT NOT NULL,
                property TEXT NOT NULL,
                time REAL NOT NULL,
                value REAL NOT NULL,
                easing TEXT NOT NULL,
                keyframe_json TEXT NOT NULL,
                FOREIGN KEY(clip_id) REFERENCES timeline_clips(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS captions (
                id TEXT PRIMARY KEY,
                order_index INTEGER NOT NULL,
                start REAL NOT NULL,
                end REAL NOT NULL,
                text TEXT NOT NULL,
                caption_json TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS transcripts (
                id TEXT PRIMARY KEY,
                source_media_id TEXT,
                source_name TEXT,
                language TEXT,
                duration REAL NOT NULL DEFAULT 0,
                text TEXT NOT NULL DEFAULT '',
                srt_content TEXT NOT NULL DEFAULT '',
                vtt_content TEXT NOT NULL DEFAULT '',
                segments_json TEXT NOT NULL DEFAULT '[]',
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS storyboard_scenes (
                id TEXT PRIMARY KEY,
                order_index INTEGER NOT NULL,
                start REAL NOT NULL,
                end REAL NOT NULL,
                transcript TEXT NOT NULL,
                visual_type TEXT NOT NULL,
                prompt TEXT NOT NULL,
                negative_prompt TEXT NOT NULL,
                style TEXT NOT NULL,
                camera TEXT NOT NULL,
                status TEXT NOT NULL,
                scene_json TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS generation_batches (
                id TEXT PRIMARY KEY,
                project_id TEXT,
                provider TEXT NOT NULL,
                aspect_ratio TEXT,
                paused INTEGER NOT NULL DEFAULT 0,
                status TEXT NOT NULL DEFAULT 'active',
                metadata_json TEXT NOT NULL DEFAULT '{}',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS generation_jobs (
                id TEXT PRIMARY KEY,
                sort_order INTEGER NOT NULL,
                batch_id TEXT NOT NULL,
                project_id TEXT,
                scene_id TEXT NOT NULL,
                provider TEXT NOT NULL,
                media_type TEXT NOT NULL,
                prompt TEXT NOT NULL,
                negative_prompt TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL,
                result_url TEXT,
                local_path TEXT,
                error TEXT,
                attempt_count INTEGER NOT NULL DEFAULT 0,
                current_attempt INTEGER NOT NULL DEFAULT 0,
                worker_id TEXT,
                claimed_at TEXT,
                claim_expires_at TEXT,
                metadata_json TEXT NOT NULL DEFAULT '{}',
                job_json TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY(batch_id) REFERENCES generation_batches(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_generation_jobs_claim
                ON generation_jobs(status, provider, sort_order);
            CREATE INDEX IF NOT EXISTS idx_generation_jobs_scene
                ON generation_jobs(batch_id, scene_id);

            CREATE TABLE IF NOT EXISTS generation_job_attempts (
                id TEXT PRIMARY KEY,
                job_id TEXT NOT NULL,
                attempt_number INTEGER NOT NULL,
                prompt TEXT NOT NULL,
                status TEXT NOT NULL,
                error TEXT,
                worker_id TEXT,
                started_at TEXT,
                completed_at TEXT,
                metadata_json TEXT NOT NULL DEFAULT '{}',
                FOREIGN KEY(job_id) REFERENCES generation_jobs(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS generation_variants (
                id TEXT PRIMARY KEY,
                job_id TEXT NOT NULL,
                variant_index INTEGER NOT NULL,
                url TEXT NOT NULL,
                media_type TEXT NOT NULL,
                local_path TEXT,
                width REAL,
                height REAL,
                source TEXT NOT NULL,
                is_selected INTEGER NOT NULL DEFAULT 0,
                variant_json TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY(job_id) REFERENCES generation_jobs(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS exports (
                id TEXT PRIMARY KEY,
                output_path TEXT NOT NULL,
                settings_json TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS bridge_workers (
                id TEXT PRIMARY KEY,
                providers_json TEXT NOT NULL,
                status TEXT NOT NULL,
                connected_at TEXT,
                last_seen_at TEXT,
                metadata_json TEXT NOT NULL DEFAULT '{}'
            );

            CREATE TABLE IF NOT EXISTS bridge_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                worker_id TEXT,
                job_id TEXT,
                event_type TEXT NOT NULL,
                message TEXT,
                metadata_json TEXT NOT NULL DEFAULT '{}',
                created_at TEXT NOT NULL
            );

            INSERT OR IGNORE INTO schema_migrations(version, applied_at)
            VALUES (1, CURRENT_TIMESTAMP);
            """
        )

    def upsert_project(self, project: ProjectDetail) -> None:
        database_path = Path(project.folder_path) / PROJECT_DATABASE_NAME
        Path(project.folder_path).mkdir(parents=True, exist_ok=True)
        Path(project.generated_media_path).mkdir(parents=True, exist_ok=True)
        with self._lock:
            with self._project_connect(database_path) as project_connection:
                self._initialize_project_database(project_connection)
                self._upsert_project_row(project_connection, project)
                self._save_state_to_project_db(project_connection, project)
            self._upsert_registry_project(project, database_path)

    def get_project(self, project_id: str) -> Optional[ProjectDetail]:
        row = self._registry_project_row(project_id)
        if not row:
            return None
        database_path = Path(row["database_path"])
        if not database_path.exists():
            return self._project_from_registry_row(row)
        with self._lock, self._project_connect(database_path) as connection:
            self._initialize_project_database(connection)
            project_row = connection.execute(
                "SELECT * FROM projects WHERE id = ?",
                (project_id,),
            ).fetchone()
            if not project_row:
                return self._project_from_registry_row(row)
            return self._project_from_project_db_row(connection, project_row)

    def get_project_from_database_path(self, database_path: Path) -> Optional[ProjectDetail]:
        if database_path.is_dir():
            database_path = database_path / PROJECT_DATABASE_NAME
        if not database_path.exists():
            return None
        with self._lock, self._project_connect(database_path) as connection:
            self._initialize_project_database(connection)
            row = connection.execute("SELECT * FROM projects LIMIT 1").fetchone()
            if not row:
                return None
            project = self._project_from_project_db_row(connection, row)
            self._upsert_registry_project(project, database_path)
            return project

    def list_projects(self) -> List[ProjectDetail]:
        with self._lock, self._registry_connect() as connection:
            rows = connection.execute(
                "SELECT * FROM registry_projects ORDER BY updated_at DESC, last_opened_at DESC"
            ).fetchall()
        projects: List[ProjectDetail] = []
        for row in rows:
            project = self.get_project(row["id"]) or self._project_from_registry_row(row)
            if project:
                projects.append(project)
        return projects

    def save_generation_state(
        self,
        ordered_jobs: Iterable[GenerationJob],
        paused_batch_keys: Iterable[str],
    ) -> None:
        jobs = list(ordered_jobs)
        paused_by_project: Dict[str, set[str]] = {}
        for key in paused_batch_keys:
            project_id, batch_id = self._split_batch_key(key)
            if project_id:
                paused_by_project.setdefault(project_id, set()).add(batch_id)

        jobs_by_project: Dict[str, List[tuple[int, GenerationJob]]] = {}
        for index, job in enumerate(jobs):
            if not job.project_id:
                continue
            jobs_by_project.setdefault(job.project_id, []).append((index, job))

        with self._lock:
            for project_id, indexed_jobs in jobs_by_project.items():
                database_path = self._project_database_path_for_id(project_id)
                if not database_path:
                    continue
                with self._project_connect(database_path) as connection:
                    self._initialize_project_database(connection)
                    self._set_paused_batches(connection, paused_by_project.get(project_id, set()))
                    for sort_order, job in indexed_jobs:
                        self._upsert_generation_job_row(connection, job, sort_order)

    def load_generation_state(self) -> Tuple[List[GenerationJob], List[str], set[str]]:
        jobs: List[GenerationJob] = []
        order: List[str] = []
        paused: set[str] = set()
        with self._lock:
            for project in self.list_projects():
                database_path = self._project_database_path_for_id(project.id)
                if not database_path or not database_path.exists():
                    continue
                with self._project_connect(database_path) as connection:
                    self._initialize_project_database(connection)
                    for job in self._load_jobs_from_connection(connection):
                        jobs.append(job)
                        order.append(job.id)
                    for row in connection.execute("SELECT id FROM generation_batches WHERE paused = 1").fetchall():
                        paused.add(self._batch_key(row["id"], project.id))
        return jobs, order, paused

    def claim_next_generation_job(
        self,
        provider: Optional[ProviderName] = None,
        worker_id: Optional[str] = None,
        project_id: Optional[str] = None,
    ) -> Optional[GenerationJob]:
        project_ids = [project_id] if project_id else [project.id for project in self.list_projects()]
        with self._lock:
            for current_project_id in [pid for pid in project_ids if pid]:
                database_path = self._project_database_path_for_id(current_project_id)
                if not database_path:
                    continue
                with self._project_connect(database_path) as connection:
                    self._initialize_project_database(connection)
                    self._recover_stale_running_jobs(connection, provider)
                    params: list[Any] = ["queued"]
                    where = ["status = ?", "batch_id NOT IN (SELECT id FROM generation_batches WHERE paused = 1)"]
                    if provider:
                        where.append("provider = ?")
                        params.append(provider)
                    row = connection.execute(
                        f"""
                        SELECT job_json FROM generation_jobs
                        WHERE {" AND ".join(where)}
                        ORDER BY sort_order ASC, created_at ASC
                        LIMIT 1
                        """,
                        params,
                    ).fetchone()
                    if not row:
                        continue
                    job = self._job_from_json(row["job_json"])
                    if not job:
                        continue
                    metadata = dict(job.metadata)
                    run_attempt = self._metadata_int(metadata.get("runAttempt"), 0) + 1
                    claimed_at = _utc_now()
                    metadata["runAttempt"] = str(run_attempt)
                    metadata["claimedAt"] = claimed_at.isoformat()
                    metadata["claimExpiresAt"] = (
                        claimed_at + timedelta(seconds=RUNNING_JOB_TIMEOUT_SECONDS)
                    ).isoformat()
                    if worker_id:
                        metadata["workerId"] = worker_id
                    claimed_job = job.model_copy(update={"status": "running", "metadata": metadata})
                    sort_order = self._job_sort_order(connection, claimed_job.id)
                    self._upsert_generation_job_row(connection, claimed_job, sort_order)
                    return claimed_job
        return None

    def upsert_generation_job(self, job: GenerationJob, sort_order: int = 0) -> None:
        if not job.project_id:
            return
        database_path = self._project_database_path_for_id(job.project_id)
        if not database_path:
            return
        with self._lock, self._project_connect(database_path) as connection:
            self._initialize_project_database(connection)
            self._upsert_generation_job_row(connection, job, sort_order)

    def clear_generation_jobs(
        self,
        project_id: Optional[str],
        provider: Optional[ProviderName],
        statuses: Iterable[GenerationJobStatus],
    ) -> int:
        project_ids = [project_id] if project_id else [project.id for project in self.list_projects()]
        status_values = [str(status) for status in statuses]
        if not status_values:
            return 0

        deleted = 0
        with self._lock:
            for current_project_id in [pid for pid in project_ids if pid]:
                database_path = self._project_database_path_for_id(current_project_id)
                if not database_path or not database_path.exists():
                    continue
                with self._project_connect(database_path) as connection:
                    self._initialize_project_database(connection)
                    placeholders = ",".join("?" for _ in status_values)
                    params: list[Any] = [*status_values]
                    where = [f"status IN ({placeholders})"]
                    if provider:
                        where.append("provider = ?")
                        params.append(provider)
                    result = connection.execute(
                        f"DELETE FROM generation_jobs WHERE {' AND '.join(where)}",
                        params,
                    )
                    deleted += result.rowcount if result.rowcount is not None else 0
        return deleted

    def set_batch_paused(self, batch_id: str, paused: bool, project_id: Optional[str]) -> None:
        if not project_id:
            return
        database_path = self._project_database_path_for_id(project_id)
        if not database_path:
            return
        with self._lock, self._project_connect(database_path) as connection:
            self._initialize_project_database(connection)
            connection.execute(
                """
                INSERT INTO generation_batches(id, project_id, provider, paused, created_at, updated_at)
                VALUES (?, ?, 'meta', ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET paused = excluded.paused, updated_at = excluded.updated_at
                """,
                (batch_id, project_id, int(paused), _utc_now_iso(), _utc_now_iso()),
            )

    def _upsert_registry_project(self, project: ProjectDetail, database_path: Path) -> None:
        with self._registry_connect() as connection:
            connection.execute(
                """
                INSERT INTO registry_projects (
                    id, name, folder_path, generated_media_path, project_file_path,
                    database_path, created_at, updated_at, last_opened_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    name = excluded.name,
                    folder_path = excluded.folder_path,
                    generated_media_path = excluded.generated_media_path,
                    project_file_path = excluded.project_file_path,
                    database_path = excluded.database_path,
                    created_at = excluded.created_at,
                    updated_at = excluded.updated_at,
                    last_opened_at = excluded.last_opened_at
                """,
                (
                    project.id,
                    project.name,
                    project.folder_path,
                    project.generated_media_path,
                    project.project_file_path,
                    str(database_path),
                    project.created_at,
                    project.updated_at,
                    _utc_now_iso(),
                ),
            )

    def _upsert_project_row(self, connection: sqlite3.Connection, project: ProjectDetail) -> None:
        connection.execute(
            """
            INSERT INTO projects (
                id, name, folder_path, generated_media_path, project_file_path,
                created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                folder_path = excluded.folder_path,
                generated_media_path = excluded.generated_media_path,
                project_file_path = excluded.project_file_path,
                created_at = excluded.created_at,
                updated_at = excluded.updated_at
            """,
            (
                project.id,
                project.name,
                project.folder_path,
                project.generated_media_path,
                project.project_file_path,
                project.created_at,
                project.updated_at,
            ),
        )

    def _save_state_to_project_db(self, connection: sqlite3.Connection, project: ProjectDetail) -> None:
        state = project.state if isinstance(project.state, dict) else {}
        now = _utc_now_iso()

        self._replace_settings(
            connection,
            {
                "version": state.get("version", 1),
                "savedAt": state.get("savedAt", now),
                "project": state.get("project"),
                "exportSettings": state.get("exportSettings"),
                "storyboardSettings": state.get("storyboardSettings"),
                "currentGenerationBatchId": state.get("currentGenerationBatchId"),
                "isGenerationBatchPaused": bool(state.get("isGenerationBatchPaused", False)),
            },
        )
        self._replace_media_assets(connection, state.get("assets", []))
        self._replace_timeline_tracks(connection, state.get("tracks", []))
        self._replace_timeline_clips(connection, state.get("clips", []))
        self._replace_captions(connection, state.get("captions", []))
        self._replace_storyboard_scenes(connection, state.get("storyboardScenes", []))

        jobs = state.get("generationJobs", [])
        if isinstance(jobs, list):
            for index, item in enumerate(jobs):
                try:
                    job = GenerationJob(**item)
                except ValueError:
                    continue
                if not self._generation_job_exists(connection, job.id):
                    self._upsert_generation_job_row(connection, job, index)

    def _replace_settings(self, connection: sqlite3.Connection, settings: Dict[str, Any]) -> None:
        now = _utc_now_iso()
        connection.execute("DELETE FROM project_settings")
        for key, value in settings.items():
            connection.execute(
                """
                INSERT INTO project_settings(key, value_json, updated_at)
                VALUES (?, ?, ?)
                """,
                (key, _json_dumps(value), now),
            )

    def _replace_media_assets(self, connection: sqlite3.Connection, assets: Any) -> None:
        connection.execute("DELETE FROM media_assets")
        if not isinstance(assets, list):
            return
        now = _utc_now_iso()
        for item in assets:
            if not isinstance(item, dict) or not item.get("id"):
                continue
            connection.execute(
                """
                INSERT INTO media_assets (
                    id, type, media_kind, source_url, local_path, file_name,
                    file_type, file_size, checksum, asset_json, created_at, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    str(item["id"]),
                    str(item.get("type") or "visual"),
                    str(item.get("mediaKind") or item.get("media_kind") or "image"),
                    item.get("sourceUrl") or item.get("source_url"),
                    item.get("localPath") or item.get("local_path"),
                    item.get("fileName") or item.get("file_name"),
                    item.get("fileType") or item.get("file_type"),
                    self._safe_int(item.get("fileSize") or item.get("file_size")),
                    item.get("checksum"),
                    _json_dumps(item),
                    now,
                    now,
                ),
            )

    def _replace_timeline_tracks(self, connection: sqlite3.Connection, tracks: Any) -> None:
        connection.execute("DELETE FROM timeline_tracks")
        if not isinstance(tracks, list):
            return
        now = _utc_now_iso()
        for index, item in enumerate(tracks):
            if not isinstance(item, dict) or not item.get("id"):
                continue
            connection.execute(
                """
                INSERT INTO timeline_tracks (
                    id, order_index, type, name, muted, solo, locked, track_json, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    str(item["id"]),
                    self._safe_int(item.get("order"), index),
                    str(item.get("type") or "visual"),
                    str(item.get("name") or item["id"]),
                    int(bool(item.get("muted"))),
                    int(bool(item.get("solo"))),
                    int(bool(item.get("locked"))),
                    _json_dumps(item),
                    now,
                ),
            )

    def _replace_timeline_clips(self, connection: sqlite3.Connection, clips: Any) -> None:
        connection.execute("DELETE FROM timeline_clips")
        if not isinstance(clips, list):
            return
        now = _utc_now_iso()
        for item in clips:
            if not isinstance(item, dict) or not item.get("id"):
                continue
            generation = item.get("generation") if isinstance(item.get("generation"), dict) else {}
            connection.execute(
                """
                INSERT INTO timeline_clips (
                    id, asset_id, track_id, type, start_time, duration, media_offset,
                    file_name, file_type, file_size, generation_job_id,
                    generation_scene_id, clip_json, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    str(item["id"]),
                    str(item.get("assetId") or item.get("asset_id") or ""),
                    str(item.get("trackId") or item.get("track_id") or ""),
                    str(item.get("type") or "visual"),
                    self._safe_float(item.get("startTime") or item.get("start_time")),
                    self._safe_float(item.get("duration"), 0.1),
                    self._safe_float(item.get("mediaOffset") or item.get("media_offset")),
                    item.get("fileName") or item.get("file_name"),
                    item.get("fileType") or item.get("file_type"),
                    self._safe_int(item.get("fileSize") or item.get("file_size")),
                    generation.get("jobId") or generation.get("job_id"),
                    generation.get("sceneId") or generation.get("scene_id"),
                    _json_dumps(item),
                    now,
                ),
            )
            keyframes = item.get("keyframes")
            if isinstance(keyframes, list):
                for keyframe in keyframes:
                    if not isinstance(keyframe, dict) or not keyframe.get("id"):
                        continue
                    connection.execute(
                        """
                        INSERT INTO clip_keyframes (
                            id, clip_id, property, time, value, easing, keyframe_json
                        )
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            str(keyframe["id"]),
                            str(item["id"]),
                            str(keyframe.get("property") or "opacity"),
                            self._safe_float(keyframe.get("time")),
                            self._safe_float(keyframe.get("value")),
                            str(keyframe.get("easing") or "linear"),
                            _json_dumps(keyframe),
                        ),
                    )

    def _replace_captions(self, connection: sqlite3.Connection, captions: Any) -> None:
        connection.execute("DELETE FROM captions")
        if not isinstance(captions, list):
            return
        for index, item in enumerate(captions):
            if not isinstance(item, dict):
                continue
            caption_id = str(item.get("id") or f"caption-{index + 1}")
            connection.execute(
                """
                INSERT INTO captions(id, order_index, start, end, text, caption_json)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    caption_id,
                    self._safe_int(item.get("index"), index + 1),
                    self._safe_float(item.get("start")),
                    self._safe_float(item.get("end")),
                    str(item.get("text") or ""),
                    _json_dumps({**item, "id": caption_id}),
                ),
            )

    def _replace_storyboard_scenes(self, connection: sqlite3.Connection, scenes: Any) -> None:
        connection.execute("DELETE FROM storyboard_scenes")
        if not isinstance(scenes, list):
            return
        now = _utc_now_iso()
        for index, item in enumerate(scenes):
            if not isinstance(item, dict):
                continue
            scene_id = str(item.get("id") or f"scene-{index + 1:03d}")
            visual_type = item.get("visualType") or item.get("visual_type") or "image"
            negative_prompt = item.get("negativePrompt") or item.get("negative_prompt") or ""
            connection.execute(
                """
                INSERT INTO storyboard_scenes (
                    id, order_index, start, end, transcript, visual_type, prompt,
                    negative_prompt, style, camera, status, scene_json, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    scene_id,
                    index,
                    self._safe_float(item.get("start")),
                    self._safe_float(item.get("end"), 5.0),
                    str(item.get("transcript") or ""),
                    str(visual_type),
                    str(item.get("prompt") or ""),
                    str(negative_prompt),
                    str(item.get("style") or ""),
                    str(item.get("camera") or ""),
                    str(item.get("status") or "draft"),
                    _json_dumps({**item, "id": scene_id}),
                    now,
                ),
            )

    def _upsert_generation_job_row(
        self,
        connection: sqlite3.Connection,
        job: GenerationJob,
        sort_order: int,
    ) -> None:
        now = _utc_now_iso()
        metadata = dict(job.metadata)
        batch_metadata = {
            key: value
            for key, value in metadata.items()
            if key in ("aspectRatio", "projectId")
        }
        connection.execute(
            """
            INSERT INTO generation_batches (
                id, project_id, provider, aspect_ratio, metadata_json, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                project_id = COALESCE(excluded.project_id, generation_batches.project_id),
                provider = excluded.provider,
                aspect_ratio = COALESCE(excluded.aspect_ratio, generation_batches.aspect_ratio),
                metadata_json = excluded.metadata_json,
                updated_at = excluded.updated_at
            """,
            (
                job.batch_id,
                job.project_id,
                job.provider,
                metadata.get("aspectRatio"),
                _json_dumps(batch_metadata),
                now,
                now,
            ),
        )
        current_attempt = self._metadata_int(metadata.get("runAttempt"), 0)
        attempt_count = max(current_attempt, self._existing_attempt_count(connection, job.id))
        connection.execute(
            """
            INSERT INTO generation_jobs (
                id, sort_order, batch_id, project_id, scene_id, provider, media_type,
                prompt, negative_prompt, status, result_url, local_path, error,
                attempt_count, current_attempt, worker_id, claimed_at, claim_expires_at,
                metadata_json, job_json, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                sort_order = excluded.sort_order,
                batch_id = excluded.batch_id,
                project_id = excluded.project_id,
                scene_id = excluded.scene_id,
                provider = excluded.provider,
                media_type = excluded.media_type,
                prompt = excluded.prompt,
                negative_prompt = excluded.negative_prompt,
                status = excluded.status,
                result_url = excluded.result_url,
                local_path = excluded.local_path,
                error = excluded.error,
                attempt_count = MAX(generation_jobs.attempt_count, excluded.attempt_count),
                current_attempt = excluded.current_attempt,
                worker_id = excluded.worker_id,
                claimed_at = excluded.claimed_at,
                claim_expires_at = excluded.claim_expires_at,
                metadata_json = excluded.metadata_json,
                job_json = excluded.job_json,
                updated_at = excluded.updated_at
            """,
            (
                job.id,
                sort_order,
                job.batch_id,
                job.project_id,
                job.scene_id,
                job.provider,
                job.media_type,
                job.prompt,
                job.negative_prompt,
                job.status,
                job.result_url,
                job.local_path,
                job.error,
                attempt_count,
                current_attempt,
                metadata.get("workerId"),
                metadata.get("claimedAt"),
                metadata.get("claimExpiresAt"),
                _json_dumps(metadata),
                job.model_dump_json(by_alias=True),
                now,
                now,
            ),
        )
        connection.execute("DELETE FROM generation_variants WHERE job_id = ?", (job.id,))
        for index, variant in enumerate(job.result_variants or [], 1):
            self._insert_generation_variant(connection, job, variant, index)
        self._record_job_attempt(connection, job)

    def _insert_generation_variant(
        self,
        connection: sqlite3.Connection,
        job: GenerationJob,
        variant: GenerationMediaVariant,
        index: int,
    ) -> None:
        variant_id = variant.id or f"{job.id}-variant-{index}"
        connection.execute(
            """
            INSERT INTO generation_variants (
                id, job_id, variant_index, url, media_type, local_path, width,
                height, source, is_selected, variant_json, created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                f"{job.id}:{variant_id}",
                job.id,
                index,
                variant.url,
                variant.media_type,
                variant.local_path,
                variant.width,
                variant.height,
                variant.source,
                int(bool(job.result_url and variant.url == job.result_url)),
                variant.model_dump_json(by_alias=True),
                _utc_now_iso(),
            ),
        )

    def _record_job_attempt(self, connection: sqlite3.Connection, job: GenerationJob) -> None:
        metadata = dict(job.metadata)
        attempt_number = self._metadata_int(metadata.get("runAttempt"), 0)
        if attempt_number <= 0:
            return
        now = _utc_now_iso()
        is_terminal = job.status in ("completed", "failed", "canceled", "manual_action_required")
        connection.execute(
            """
            INSERT INTO generation_job_attempts (
                id, job_id, attempt_number, prompt, status, error, worker_id,
                started_at, completed_at, metadata_json
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                prompt = excluded.prompt,
                status = excluded.status,
                error = excluded.error,
                worker_id = excluded.worker_id,
                completed_at = COALESCE(excluded.completed_at, generation_job_attempts.completed_at),
                metadata_json = excluded.metadata_json
            """,
            (
                f"{job.id}:{attempt_number}",
                job.id,
                attempt_number,
                job.prompt,
                job.status,
                job.error,
                metadata.get("workerId"),
                metadata.get("claimedAt") or now,
                now if is_terminal else None,
                _json_dumps(metadata),
            ),
        )

    def _project_from_project_db_row(
        self,
        connection: sqlite3.Connection,
        row: sqlite3.Row,
    ) -> ProjectDetail:
        state = self._load_state_from_project_db(connection, row)
        return ProjectDetail(
            id=row["id"],
            name=row["name"],
            folderPath=row["folder_path"],
            generatedMediaPath=row["generated_media_path"],
            projectFilePath=row["project_file_path"],
            createdAt=row["created_at"],
            updatedAt=row["updated_at"],
            state=state,
        )

    def _load_state_from_project_db(
        self,
        connection: sqlite3.Connection,
        project_row: sqlite3.Row,
    ) -> Dict[str, Any]:
        settings = {
            row["key"]: _json_loads(row["value_json"], None)
            for row in connection.execute("SELECT key, value_json FROM project_settings").fetchall()
        }
        jobs = [job.model_dump(by_alias=True) for job in self._load_jobs_from_connection(connection)]
        generated_media_assets = [
            asset.model_dump(by_alias=True)
            for asset in self._generated_assets_from_jobs(self._load_jobs_from_connection(connection))
        ]
        state = {
            "version": settings.get("version") or 1,
            "savedAt": settings.get("savedAt") or project_row["updated_at"],
            "project": {
                "id": project_row["id"],
                "name": project_row["name"],
                "folderPath": project_row["folder_path"],
                "generatedMediaPath": project_row["generated_media_path"],
                "projectFilePath": project_row["project_file_path"],
                "createdAt": project_row["created_at"],
                "updatedAt": project_row["updated_at"],
            },
            "assets": self._load_json_rows(connection, "media_assets", "asset_json", "id ASC"),
            "tracks": self._load_json_rows(connection, "timeline_tracks", "track_json", "order_index ASC"),
            "clips": self._load_json_rows(connection, "timeline_clips", "clip_json", "start_time ASC, id ASC"),
            "captions": self._load_json_rows(connection, "captions", "caption_json", "order_index ASC"),
            "exportSettings": settings.get("exportSettings"),
            "storyboardSettings": settings.get("storyboardSettings"),
            "storyboardScenes": self._load_json_rows(connection, "storyboard_scenes", "scene_json", "order_index ASC"),
            "currentGenerationBatchId": settings.get("currentGenerationBatchId"),
            "generationJobs": jobs,
            "generatedMediaAssets": generated_media_assets,
            "isGenerationBatchPaused": bool(settings.get("isGenerationBatchPaused", False)),
        }
        return {key: value for key, value in state.items() if value is not None}

    def _load_json_rows(
        self,
        connection: sqlite3.Connection,
        table: str,
        column: str,
        order_by: str,
    ) -> List[Dict[str, Any]]:
        rows = connection.execute(f"SELECT {column} FROM {table} ORDER BY {order_by}").fetchall()
        values: List[Dict[str, Any]] = []
        for row in rows:
            value = _json_loads(row[column], {})
            if isinstance(value, dict):
                values.append(value)
        return values

    def _load_jobs_from_connection(self, connection: sqlite3.Connection) -> List[GenerationJob]:
        rows = connection.execute(
            "SELECT job_json FROM generation_jobs ORDER BY sort_order ASC, created_at ASC"
        ).fetchall()
        jobs: List[GenerationJob] = []
        for row in rows:
            job = self._job_from_json(row["job_json"])
            if job:
                jobs.append(job)
        return jobs

    def _generated_assets_from_jobs(self, jobs: Iterable[GenerationJob]) -> List[GeneratedMediaAsset]:
        assets: List[GeneratedMediaAsset] = []
        for job in jobs:
            if job.status == "completed" and not job.result_url:
                continue
            if job.status != "completed" and job.status not in ("failed", "manual_action_required"):
                continue
            start = self._safe_float(job.metadata.get("sceneStart"))
            end = self._safe_float(job.metadata.get("sceneEnd"), start + 5.0)
            if end <= start:
                end = start + 5.0
            assets.append(
                GeneratedMediaAsset(
                    jobId=job.id,
                    batchId=job.batch_id,
                    projectId=job.project_id,
                    sceneId=job.scene_id,
                    provider=job.provider,
                    mediaType=job.media_type,
                    status=job.status,
                    resultUrl=job.result_url,
                    resultVariants=job.result_variants,
                    localPath=job.local_path,
                    prompt=job.prompt,
                    negativePrompt=job.negative_prompt,
                    start=start,
                    end=end,
                    duration=end - start,
                    transcript=job.metadata.get("sceneTranscript", ""),
                    error=job.error,
                    metadata=job.metadata,
                )
            )
        return assets

    def _set_paused_batches(self, connection: sqlite3.Connection, paused_batch_ids: set[str]) -> None:
        connection.execute("UPDATE generation_batches SET paused = 0")
        for batch_id in paused_batch_ids:
            connection.execute(
                """
                INSERT INTO generation_batches(id, provider, paused, created_at, updated_at)
                VALUES (?, 'meta', 1, ?, ?)
                ON CONFLICT(id) DO UPDATE SET paused = 1, updated_at = excluded.updated_at
                """,
                (batch_id, _utc_now_iso(), _utc_now_iso()),
            )

    def _recover_stale_running_jobs(
        self,
        connection: sqlite3.Connection,
        provider: Optional[ProviderName] = None,
    ) -> None:
        now = _utc_now()
        rows = connection.execute(
            """
            SELECT id, provider, job_json, claim_expires_at, claimed_at
            FROM generation_jobs
            WHERE status = 'running'
            """
        ).fetchall()
        for row in rows:
            if provider and row["provider"] != provider:
                continue
            expires_at = _parse_iso(row["claim_expires_at"])
            claimed_at = _parse_iso(row["claimed_at"])
            is_expired = expires_at and expires_at <= now
            is_legacy_stale = (
                not expires_at
                and claimed_at
                and claimed_at + timedelta(seconds=RUNNING_JOB_TIMEOUT_SECONDS) <= now
            )
            if not is_expired and not is_legacy_stale:
                continue
            job = self._job_from_json(row["job_json"])
            if not job:
                continue
            metadata = dict(job.metadata)
            metadata["requeuedAfterTimeout"] = now.isoformat()
            metadata.pop("workerId", None)
            metadata.pop("claimedAt", None)
            metadata.pop("claimExpiresAt", None)
            recovered = job.model_copy(
                update={
                    "status": "queued",
                    "error": "Previous browser worker stopped before finishing; job was re-queued.",
                    "metadata": metadata,
                }
            )
            self._upsert_generation_job_row(connection, recovered, self._job_sort_order(connection, job.id))

    def _job_sort_order(self, connection: sqlite3.Connection, job_id: str) -> int:
        row = connection.execute(
            "SELECT sort_order FROM generation_jobs WHERE id = ?",
            (job_id,),
        ).fetchone()
        return int(row["sort_order"]) if row else 0

    def _generation_job_exists(self, connection: sqlite3.Connection, job_id: str) -> bool:
        row = connection.execute(
            "SELECT 1 FROM generation_jobs WHERE id = ?",
            (job_id,),
        ).fetchone()
        return row is not None

    def _existing_attempt_count(self, connection: sqlite3.Connection, job_id: str) -> int:
        row = connection.execute(
            "SELECT MAX(attempt_number) AS max_attempt FROM generation_job_attempts WHERE job_id = ?",
            (job_id,),
        ).fetchone()
        return int(row["max_attempt"] or 0) if row else 0

    def _registry_project_row(self, project_id: str) -> Optional[sqlite3.Row]:
        with self._lock, self._registry_connect() as connection:
            return connection.execute(
                "SELECT * FROM registry_projects WHERE id = ?",
                (project_id,),
            ).fetchone()

    def _project_database_path_for_id(self, project_id: str) -> Optional[Path]:
        row = self._registry_project_row(project_id)
        if not row:
            return None
        return Path(row["database_path"])

    def _project_from_registry_row(self, row: sqlite3.Row) -> ProjectDetail:
        return ProjectDetail(
            id=row["id"],
            name=row["name"],
            folderPath=row["folder_path"],
            generatedMediaPath=row["generated_media_path"],
            projectFilePath=row["project_file_path"],
            createdAt=row["created_at"],
            updatedAt=row["updated_at"],
            state={},
        )

    def _merge_legacy_jobs_into_projects(self, jobs: List[GenerationJob], order: List[str]) -> None:
        if not self.legacy_database_path or not self.legacy_database_path.exists():
            return
        if self.legacy_database_path == self.registry_database_path:
            return
        known = {job.id for job in jobs}
        try:
            with sqlite3.connect(self.legacy_database_path) as connection:
                connection.row_factory = sqlite3.Row
                rows = connection.execute(
                    "SELECT job_json FROM generation_jobs ORDER BY sort_order ASC, rowid ASC"
                ).fetchall()
        except sqlite3.Error:
            return
        for row in rows:
            job = self._job_from_json(row["job_json"])
            if not job or job.id in known:
                continue
            jobs.append(job)
            order.append(job.id)
            known.add(job.id)

    def _job_from_json(self, payload: str) -> Optional[GenerationJob]:
        try:
            return GenerationJob(**json.loads(payload))
        except (TypeError, ValueError, json.JSONDecodeError):
            return None

    def _split_batch_key(self, key: str) -> tuple[Optional[str], str]:
        project_id, _, batch_id = key.partition(":")
        return (None if project_id == "legacy" else project_id or None, batch_id or key)

    def _batch_key(self, batch_id: str, project_id: Optional[str] = None) -> str:
        return f"{project_id or 'legacy'}:{batch_id}"

    def _safe_float(self, value: Any, fallback: float = 0.0) -> float:
        try:
            return float(value)
        except (TypeError, ValueError):
            return fallback

    def _safe_int(self, value: Any, fallback: int = 0) -> int:
        try:
            return int(value)
        except (TypeError, ValueError):
            return fallback

    def _metadata_int(self, value: Optional[str], fallback: int) -> int:
        return self._safe_int(value, fallback)
