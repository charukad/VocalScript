import json
import sqlite3
import threading
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

from backend.src.domain.models.generation import (
    GeneratedMediaAsset,
    GeneratedMediaType,
    GenerationJob,
    GenerationJobStatus,
    GenerationMediaVariant,
    ProviderName,
)
from backend.src.domain.models.analytics import (
    AnalyticsAccount,
    AnalyticsConnection,
    AnalyticsSnapshot,
    ContentPerformanceRule,
    ContentPerformance,
    ProfileLearning,
)
from backend.src.domain.models.ab_testing import Experiment
from backend.src.domain.models.brand_kit import BrandKit
from backend.src.domain.models.character_consistency import CharacterProfile
from backend.src.domain.models.comments import CommentAnalysisRun
from backend.src.domain.models.content_calendar import CalendarItem
from backend.src.domain.models.competitor import CompetitorContent
from backend.src.domain.models.content_profile import ContentProfile
from backend.src.domain.models.content_studio import ContentIdea, ContentTrend, NarrationLine, Script, ScriptVersion
from backend.src.domain.models.agent import AgentRun, WorkflowRun
from backend.src.domain.models.publishing import PublishJob, PublishingDestination
from backend.src.domain.models.project import ProjectDetail, ProjectSummary
from backend.src.domain.models.prompt_library import PromptTemplate


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

    @contextmanager
    def _registry_connect(self):
        connection = sqlite3.connect(self.registry_database_path)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        try:
            with connection:
                yield connection
        finally:
            connection.close()

    @contextmanager
    def _project_connect(self, database_path: Path):
        database_path.parent.mkdir(parents=True, exist_ok=True)
        connection = sqlite3.connect(database_path)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        try:
            with connection:
                yield connection
        finally:
            connection.close()

    @contextmanager
    def _project_read_only_connect(self, database_path: Path):
        connection = sqlite3.connect(f"file:{database_path}?mode=ro", uri=True)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        try:
            with connection:
                yield connection
        finally:
            connection.close()

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
                    last_opened_at TEXT NOT NULL,
                    content_profile_id TEXT,
                    target_platform TEXT,
                    content_goal TEXT NOT NULL DEFAULT '',
                    video_type TEXT NOT NULL DEFAULT '',
                    planned_title TEXT NOT NULL DEFAULT '',
                    planned_description TEXT NOT NULL DEFAULT '',
                    script_id TEXT
                );

                CREATE INDEX IF NOT EXISTS idx_registry_projects_updated
                    ON registry_projects(updated_at DESC);

                CREATE TABLE IF NOT EXISTS content_profiles (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    description TEXT NOT NULL DEFAULT '',
                    avatar_path TEXT,
                    platforms_json TEXT NOT NULL,
                    content_type TEXT NOT NULL,
                    target_audience TEXT NOT NULL,
                    language TEXT NOT NULL,
                    tone TEXT NOT NULL,
                    default_video_length_seconds INTEGER NOT NULL,
                    voice_style TEXT NOT NULL,
                    visual_style TEXT NOT NULL,
                    hook_style TEXT NOT NULL,
                    caption_style TEXT NOT NULL,
                    brand_colors_json TEXT NOT NULL,
                    competitors_json TEXT NOT NULL,
                    posting_goals TEXT NOT NULL,
                    analytics_connection_status_json TEXT NOT NULL,
                    is_archived INTEGER NOT NULL DEFAULT 0,
                    archived_at TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    profile_json TEXT NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_content_profiles_updated
                    ON content_profiles(is_archived, updated_at DESC);

                CREATE TABLE IF NOT EXISTS brand_kits (
                    id TEXT PRIMARY KEY,
                    profile_id TEXT NOT NULL UNIQUE,
                    logo_path TEXT,
                    color_palette_json TEXT NOT NULL,
                    font_families_json TEXT NOT NULL,
                    tone_keywords_json TEXT NOT NULL,
                    avoid_keywords_json TEXT NOT NULL,
                    caption_preset TEXT NOT NULL DEFAULT '',
                    thumbnail_style TEXT NOT NULL DEFAULT '',
                    default_cta TEXT NOT NULL DEFAULT '',
                    music_style TEXT NOT NULL DEFAULT '',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    kit_json TEXT NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_brand_kits_profile
                    ON brand_kits(profile_id, updated_at DESC);

                CREATE TABLE IF NOT EXISTS prompt_templates (
                    id TEXT PRIMARY KEY,
                    profile_id TEXT NOT NULL,
                    name TEXT NOT NULL,
                    use_case TEXT NOT NULL,
                    prompt_text TEXT NOT NULL,
                    variables_json TEXT NOT NULL,
                    notes TEXT NOT NULL DEFAULT '',
                    status TEXT NOT NULL DEFAULT 'active',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    template_json TEXT NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_prompt_templates_profile
                    ON prompt_templates(profile_id, status, updated_at DESC);

                CREATE TABLE IF NOT EXISTS character_profiles (
                    id TEXT PRIMARY KEY,
                    profile_id TEXT NOT NULL,
                    name TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'active',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    character_json TEXT NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_character_profiles_profile
                    ON character_profiles(profile_id, status, updated_at DESC);

                CREATE TABLE IF NOT EXISTS calendar_items (
                    id TEXT PRIMARY KEY,
                    profile_id TEXT NOT NULL,
                    title TEXT NOT NULL,
                    scheduled_at TEXT NOT NULL,
                    platform TEXT,
                    status TEXT NOT NULL DEFAULT 'planned',
                    idea_id TEXT,
                    script_id TEXT,
                    project_id TEXT,
                    notes TEXT NOT NULL DEFAULT '',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    item_json TEXT NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_calendar_items_profile
                    ON calendar_items(profile_id, status, scheduled_at ASC);

                CREATE TABLE IF NOT EXISTS experiments (
                    id TEXT PRIMARY KEY,
                    profile_id TEXT NOT NULL,
                    name TEXT NOT NULL,
                    platform TEXT,
                    status TEXT NOT NULL DEFAULT 'planned',
                    script_id TEXT,
                    project_id TEXT,
                    winner_label TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    experiment_json TEXT NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_experiments_profile
                    ON experiments(profile_id, status, updated_at DESC);

                CREATE TABLE IF NOT EXISTS comment_analysis_runs (
                    id TEXT PRIMARY KEY,
                    profile_id TEXT NOT NULL,
                    platform TEXT,
                    source_label TEXT NOT NULL DEFAULT '',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    run_json TEXT NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_comment_analysis_runs_profile
                    ON comment_analysis_runs(profile_id, created_at DESC);

                CREATE TABLE IF NOT EXISTS content_ideas (
                    id TEXT PRIMARY KEY,
                    profile_id TEXT NOT NULL,
                    title TEXT NOT NULL,
                    topic TEXT NOT NULL DEFAULT '',
                    platform TEXT,
                    hook TEXT NOT NULL DEFAULT '',
                    estimated_viral_score INTEGER,
                    reason_it_may_work TEXT NOT NULL DEFAULT '',
                    difficulty TEXT NOT NULL DEFAULT '',
                    target_duration_seconds INTEGER,
                    suggested_visual_style TEXT NOT NULL DEFAULT '',
                    status TEXT NOT NULL DEFAULT 'draft',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    idea_json TEXT NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_content_ideas_profile_updated
                    ON content_ideas(profile_id, status, updated_at DESC);

                CREATE TABLE IF NOT EXISTS content_trends (
                    id TEXT PRIMARY KEY,
                    profile_id TEXT NOT NULL,
                    topic TEXT NOT NULL,
                    platform TEXT,
                    trend_score INTEGER,
                    platform_relevance INTEGER,
                    niche_relevance INTEGER,
                    suggested_angle TEXT NOT NULL DEFAULT '',
                    suggested_hook TEXT NOT NULL DEFAULT '',
                    content_idea_suggestions_json TEXT NOT NULL,
                    source TEXT NOT NULL DEFAULT 'manual',
                    status TEXT NOT NULL DEFAULT 'active',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    trend_json TEXT NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_content_trends_profile_updated
                    ON content_trends(profile_id, status, updated_at DESC);

                CREATE TABLE IF NOT EXISTS scripts (
                    id TEXT PRIMARY KEY,
                    profile_id TEXT NOT NULL,
                    title TEXT NOT NULL,
                    content TEXT NOT NULL DEFAULT '',
                    idea_id TEXT,
                    final_version_id TEXT,
                    status TEXT NOT NULL DEFAULT 'draft',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    script_json TEXT NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_scripts_profile_updated
                    ON scripts(profile_id, updated_at DESC);

                CREATE TABLE IF NOT EXISTS script_versions (
                    id TEXT PRIMARY KEY,
                    script_id TEXT NOT NULL,
                    label TEXT NOT NULL,
                    content TEXT NOT NULL,
                    is_selected INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    version_json TEXT NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_script_versions_script_created
                    ON script_versions(script_id, created_at DESC);

                CREATE TABLE IF NOT EXISTS narration_lines (
                    id TEXT PRIMARY KEY,
                    script_id TEXT NOT NULL,
                    scene_id TEXT,
                    order_index INTEGER NOT NULL,
                    text TEXT NOT NULL,
                    voice_style TEXT,
                    emotion TEXT,
                    speed TEXT,
                    pause_after_seconds REAL,
                    audio_asset_id TEXT,
                    duration_seconds REAL,
                    status TEXT NOT NULL DEFAULT 'pending',
                    error TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    line_json TEXT NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_narration_lines_script_order
                    ON narration_lines(script_id, order_index ASC);

                CREATE TABLE IF NOT EXISTS workflow_runs (
                    id TEXT PRIMARY KEY,
                    profile_id TEXT NOT NULL,
                    project_id TEXT,
                    workflow_type TEXT NOT NULL,
                    input_json TEXT NOT NULL,
                    output_json TEXT NOT NULL DEFAULT '{}',
                    status TEXT NOT NULL,
                    error_message TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    workflow_json TEXT NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_workflow_runs_profile_updated
                    ON workflow_runs(profile_id, updated_at DESC);

                CREATE TABLE IF NOT EXISTS agent_runs (
                    id TEXT PRIMARY KEY,
                    workflow_run_id TEXT NOT NULL,
                    profile_id TEXT NOT NULL,
                    project_id TEXT,
                    agent_name TEXT NOT NULL,
                    input_json TEXT NOT NULL,
                    output_json TEXT NOT NULL DEFAULT '{}',
                    status TEXT NOT NULL,
                    error_message TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    run_json TEXT NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_agent_runs_profile_updated
                    ON agent_runs(profile_id, updated_at DESC);
                CREATE INDEX IF NOT EXISTS idx_agent_runs_workflow_order
                    ON agent_runs(workflow_run_id, created_at ASC);

                CREATE TABLE IF NOT EXISTS agent_tasks (
                    id TEXT PRIMARY KEY,
                    workflow_run_id TEXT NOT NULL,
                    agent_run_id TEXT,
                    task_name TEXT NOT NULL,
                    status TEXT NOT NULL,
                    input_json TEXT NOT NULL DEFAULT '{}',
                    output_json TEXT NOT NULL DEFAULT '{}',
                    error_message TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS agent_outputs (
                    id TEXT PRIMARY KEY,
                    workflow_run_id TEXT NOT NULL,
                    agent_run_id TEXT,
                    output_type TEXT NOT NULL,
                    output_json TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS profile_learnings (
                    id TEXT PRIMARY KEY,
                    profile_id TEXT NOT NULL,
                    learning_type TEXT NOT NULL,
                    learning_json TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS content_performance_rules (
                    id TEXT PRIMARY KEY,
                    profile_id TEXT NOT NULL,
                    rule_key TEXT NOT NULL,
                    rule_json TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS analytics_accounts (
                    id TEXT PRIMARY KEY,
                    platform TEXT NOT NULL,
                    external_account_id TEXT,
                    display_name TEXT NOT NULL DEFAULT '',
                    token_reference TEXT,
                    metadata_json TEXT NOT NULL DEFAULT '{}',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    account_json TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS analytics_connections (
                    id TEXT PRIMARY KEY,
                    profile_id TEXT NOT NULL,
                    platform TEXT NOT NULL,
                    account_id TEXT,
                    status TEXT NOT NULL DEFAULT 'not_connected',
                    external_account_id TEXT,
                    display_name TEXT NOT NULL DEFAULT '',
                    scopes_json TEXT NOT NULL DEFAULT '[]',
                    token_reference TEXT,
                    metadata_json TEXT NOT NULL DEFAULT '{}',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    connection_json TEXT NOT NULL,
                    UNIQUE(profile_id, platform)
                );

                CREATE INDEX IF NOT EXISTS idx_analytics_connections_profile
                    ON analytics_connections(profile_id, platform);

                CREATE TABLE IF NOT EXISTS analytics_snapshots (
                    id TEXT PRIMARY KEY,
                    profile_id TEXT NOT NULL,
                    project_id TEXT,
                    platform TEXT NOT NULL,
                    external_content_id TEXT,
                    captured_at TEXT NOT NULL,
                    metrics_json TEXT NOT NULL,
                    metadata_json TEXT NOT NULL DEFAULT '{}',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    snapshot_json TEXT NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_analytics_snapshots_profile
                    ON analytics_snapshots(profile_id, captured_at DESC);

                CREATE TABLE IF NOT EXISTS content_performance (
                    id TEXT PRIMARY KEY,
                    profile_id TEXT NOT NULL,
                    project_id TEXT,
                    platform TEXT NOT NULL,
                    external_content_id TEXT,
                    title TEXT NOT NULL,
                    published_at TEXT,
                    posting_time TEXT,
                    video_length_seconds REAL,
                    hook_type TEXT NOT NULL DEFAULT '',
                    caption_style TEXT NOT NULL DEFAULT '',
                    voice_style TEXT NOT NULL DEFAULT '',
                    visual_style TEXT NOT NULL DEFAULT '',
                    traffic_source TEXT NOT NULL DEFAULT '',
                    metrics_json TEXT NOT NULL,
                    metadata_json TEXT NOT NULL DEFAULT '{}',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    performance_json TEXT NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_content_performance_profile
                    ON content_performance(profile_id, updated_at DESC);

                CREATE TABLE IF NOT EXISTS competitor_content (
                    id TEXT PRIMARY KEY,
                    profile_id TEXT NOT NULL,
                    competitor_name TEXT NOT NULL,
                    platform TEXT NOT NULL,
                    title TEXT NOT NULL,
                    content_url TEXT,
                    published_at TEXT,
                    topic TEXT NOT NULL DEFAULT '',
                    hook TEXT NOT NULL DEFAULT '',
                    format TEXT NOT NULL DEFAULT '',
                    video_length_seconds REAL,
                    views INTEGER NOT NULL DEFAULT 0,
                    likes INTEGER NOT NULL DEFAULT 0,
                    comments INTEGER NOT NULL DEFAULT 0,
                    shares INTEGER NOT NULL DEFAULT 0,
                    notes TEXT NOT NULL DEFAULT '',
                    status TEXT NOT NULL DEFAULT 'active',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    content_json TEXT NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_competitor_content_profile
                    ON competitor_content(profile_id, status, updated_at DESC);

                CREATE TABLE IF NOT EXISTS publishing_destinations (
                    id TEXT PRIMARY KEY,
                    profile_id TEXT NOT NULL,
                    platform TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'not_connected',
                    external_account_id TEXT,
                    display_name TEXT NOT NULL DEFAULT '',
                    token_reference TEXT,
                    metadata_json TEXT NOT NULL DEFAULT '{}',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    destination_json TEXT NOT NULL,
                    UNIQUE(profile_id, platform)
                );

                CREATE INDEX IF NOT EXISTS idx_publishing_destinations_profile
                    ON publishing_destinations(profile_id, platform);

                CREATE TABLE IF NOT EXISTS publish_jobs (
                    id TEXT PRIMARY KEY,
                    profile_id TEXT NOT NULL,
                    platform TEXT NOT NULL,
                    title TEXT NOT NULL,
                    scheduled_at TEXT,
                    calendar_item_id TEXT,
                    project_id TEXT,
                    status TEXT NOT NULL DEFAULT 'draft',
                    external_post_id TEXT,
                    provider_status TEXT NOT NULL DEFAULT 'placeholder',
                    error TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    job_json TEXT NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_publish_jobs_profile
                    ON publish_jobs(profile_id, status, updated_at DESC);

                INSERT OR IGNORE INTO schema_migrations(version, applied_at)
                VALUES (1, CURRENT_TIMESTAMP);

                INSERT OR IGNORE INTO schema_migrations(version, applied_at)
                VALUES (2, CURRENT_TIMESTAMP);

                INSERT OR IGNORE INTO schema_migrations(version, applied_at)
                VALUES (3, CURRENT_TIMESTAMP);

                INSERT OR IGNORE INTO schema_migrations(version, applied_at)
                VALUES (4, CURRENT_TIMESTAMP);

                INSERT OR IGNORE INTO schema_migrations(version, applied_at)
                VALUES (5, CURRENT_TIMESTAMP);

                INSERT OR IGNORE INTO schema_migrations(version, applied_at)
                VALUES (6, CURRENT_TIMESTAMP);

                INSERT OR IGNORE INTO schema_migrations(version, applied_at)
                VALUES (7, CURRENT_TIMESTAMP);

                INSERT OR IGNORE INTO schema_migrations(version, applied_at)
                VALUES (8, CURRENT_TIMESTAMP);

                INSERT OR IGNORE INTO schema_migrations(version, applied_at)
                VALUES (9, CURRENT_TIMESTAMP);
                """
            )
            self._ensure_columns(
                connection,
                "registry_projects",
                {
                    "content_profile_id": "TEXT",
                    "target_platform": "TEXT",
                    "content_goal": "TEXT NOT NULL DEFAULT ''",
                    "video_type": "TEXT NOT NULL DEFAULT ''",
                    "planned_title": "TEXT NOT NULL DEFAULT ''",
                    "planned_description": "TEXT NOT NULL DEFAULT ''",
                    "script_id": "TEXT",
                },
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
                updated_at TEXT NOT NULL,
                content_profile_id TEXT,
                target_platform TEXT,
                content_goal TEXT NOT NULL DEFAULT '',
                video_type TEXT NOT NULL DEFAULT '',
                planned_title TEXT NOT NULL DEFAULT '',
                planned_description TEXT NOT NULL DEFAULT '',
                script_id TEXT
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
        self._ensure_columns(
            connection,
            "projects",
            {
                "content_profile_id": "TEXT",
                "target_platform": "TEXT",
                "content_goal": "TEXT NOT NULL DEFAULT ''",
                "video_type": "TEXT NOT NULL DEFAULT ''",
                "planned_title": "TEXT NOT NULL DEFAULT ''",
                "planned_description": "TEXT NOT NULL DEFAULT ''",
                "script_id": "TEXT",
            },
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

    def upsert_content_profile(self, profile: ContentProfile) -> None:
        payload = profile.model_dump(by_alias=True)
        with self._lock, self._registry_connect() as connection:
            connection.execute(
                """
                INSERT INTO content_profiles (
                    id, name, description, avatar_path, platforms_json, content_type,
                    target_audience, language, tone, default_video_length_seconds,
                    voice_style, visual_style, hook_style, caption_style,
                    brand_colors_json, competitors_json, posting_goals,
                    analytics_connection_status_json, is_archived, archived_at,
                    created_at, updated_at, profile_json
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    name = excluded.name,
                    description = excluded.description,
                    avatar_path = excluded.avatar_path,
                    platforms_json = excluded.platforms_json,
                    content_type = excluded.content_type,
                    target_audience = excluded.target_audience,
                    language = excluded.language,
                    tone = excluded.tone,
                    default_video_length_seconds = excluded.default_video_length_seconds,
                    voice_style = excluded.voice_style,
                    visual_style = excluded.visual_style,
                    hook_style = excluded.hook_style,
                    caption_style = excluded.caption_style,
                    brand_colors_json = excluded.brand_colors_json,
                    competitors_json = excluded.competitors_json,
                    posting_goals = excluded.posting_goals,
                    analytics_connection_status_json = excluded.analytics_connection_status_json,
                    is_archived = excluded.is_archived,
                    archived_at = excluded.archived_at,
                    created_at = excluded.created_at,
                    updated_at = excluded.updated_at,
                    profile_json = excluded.profile_json
                """,
                (
                    profile.id,
                    profile.name,
                    profile.description,
                    profile.avatar_path,
                    _json_dumps(profile.platforms),
                    profile.content_type,
                    profile.target_audience,
                    profile.language,
                    profile.tone,
                    profile.default_video_length_seconds,
                    profile.voice_style,
                    profile.visual_style,
                    profile.hook_style,
                    profile.caption_style,
                    _json_dumps(profile.brand_colors),
                    _json_dumps(profile.competitors),
                    profile.posting_goals,
                    _json_dumps(profile.analytics_connection_status),
                    int(profile.is_archived),
                    profile.archived_at,
                    profile.created_at,
                    profile.updated_at,
                    _json_dumps(payload),
                ),
            )

    def get_content_profile(self, profile_id: str) -> Optional[ContentProfile]:
        with self._lock, self._registry_connect() as connection:
            row = connection.execute(
                "SELECT * FROM content_profiles WHERE id = ?",
                (profile_id,),
            ).fetchone()
        return self._content_profile_from_row(row) if row else None

    def list_content_profiles(self, include_archived: bool = False) -> List[ContentProfile]:
        query = "SELECT * FROM content_profiles"
        params: tuple[Any, ...] = ()
        if not include_archived:
            query += " WHERE is_archived = ?"
            params = (0,)
        query += " ORDER BY updated_at DESC, created_at DESC"
        with self._lock, self._registry_connect() as connection:
            rows = connection.execute(query, params).fetchall()
        return [profile for row in rows if (profile := self._content_profile_from_row(row))]

    def upsert_brand_kit(self, brand_kit: BrandKit) -> None:
        payload = brand_kit.model_dump(by_alias=True)
        with self._lock, self._registry_connect() as connection:
            connection.execute(
                """
                INSERT INTO brand_kits (
                    id, profile_id, logo_path, color_palette_json, font_families_json,
                    tone_keywords_json, avoid_keywords_json, caption_preset, thumbnail_style,
                    default_cta, music_style, created_at, updated_at, kit_json
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    profile_id = excluded.profile_id,
                    logo_path = excluded.logo_path,
                    color_palette_json = excluded.color_palette_json,
                    font_families_json = excluded.font_families_json,
                    tone_keywords_json = excluded.tone_keywords_json,
                    avoid_keywords_json = excluded.avoid_keywords_json,
                    caption_preset = excluded.caption_preset,
                    thumbnail_style = excluded.thumbnail_style,
                    default_cta = excluded.default_cta,
                    music_style = excluded.music_style,
                    created_at = excluded.created_at,
                    updated_at = excluded.updated_at,
                    kit_json = excluded.kit_json
                """,
                (
                    brand_kit.id,
                    brand_kit.profile_id,
                    brand_kit.logo_path,
                    _json_dumps(brand_kit.color_palette),
                    _json_dumps(brand_kit.font_families),
                    _json_dumps(brand_kit.tone_keywords),
                    _json_dumps(brand_kit.avoid_keywords),
                    brand_kit.caption_preset,
                    brand_kit.thumbnail_style,
                    brand_kit.default_cta,
                    brand_kit.music_style,
                    brand_kit.created_at,
                    brand_kit.updated_at,
                    _json_dumps(payload),
                ),
            )

    def get_brand_kit(self, profile_id: str) -> Optional[BrandKit]:
        with self._lock, self._registry_connect() as connection:
            row = connection.execute(
                "SELECT kit_json FROM brand_kits WHERE profile_id = ?",
                (profile_id,),
            ).fetchone()
        return self._brand_kit_from_json(row["kit_json"]) if row else None

    def upsert_character_profile(self, character: CharacterProfile) -> None:
        payload = character.model_dump(by_alias=True)
        with self._lock, self._registry_connect() as connection:
            connection.execute(
                """
                INSERT INTO character_profiles (
                    id, profile_id, name, status, created_at, updated_at, character_json
                )
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    profile_id = excluded.profile_id,
                    name = excluded.name,
                    status = excluded.status,
                    created_at = excluded.created_at,
                    updated_at = excluded.updated_at,
                    character_json = excluded.character_json
                """,
                (
                    character.id,
                    character.profile_id,
                    character.name,
                    character.status,
                    character.created_at,
                    character.updated_at,
                    _json_dumps(payload),
                ),
            )

    def get_character_profile(self, character_id: str) -> Optional[CharacterProfile]:
        with self._lock, self._registry_connect() as connection:
            row = connection.execute(
                "SELECT character_json FROM character_profiles WHERE id = ?",
                (character_id,),
            ).fetchone()
        return self._character_profile_from_json(row["character_json"]) if row else None

    def list_character_profiles(self, profile_id: str, include_archived: bool = False) -> List[CharacterProfile]:
        query = "SELECT character_json FROM character_profiles WHERE profile_id = ?"
        params: list[Any] = [profile_id]
        if not include_archived:
            query += " AND status <> ?"
            params.append("archived")
        query += " ORDER BY updated_at DESC, created_at DESC"
        with self._lock, self._registry_connect() as connection:
            rows = connection.execute(query, params).fetchall()
        return [
            character
            for row in rows
            if (character := self._character_profile_from_json(row["character_json"]))
        ]

    def upsert_prompt_template(self, template: PromptTemplate) -> None:
        payload = template.model_dump(by_alias=True)
        with self._lock, self._registry_connect() as connection:
            connection.execute(
                """
                INSERT INTO prompt_templates (
                    id, profile_id, name, use_case, prompt_text, variables_json,
                    notes, status, created_at, updated_at, template_json
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    profile_id = excluded.profile_id,
                    name = excluded.name,
                    use_case = excluded.use_case,
                    prompt_text = excluded.prompt_text,
                    variables_json = excluded.variables_json,
                    notes = excluded.notes,
                    status = excluded.status,
                    created_at = excluded.created_at,
                    updated_at = excluded.updated_at,
                    template_json = excluded.template_json
                """,
                (
                    template.id,
                    template.profile_id,
                    template.name,
                    template.use_case,
                    template.prompt_text,
                    _json_dumps(template.variables),
                    template.notes,
                    template.status,
                    template.created_at,
                    template.updated_at,
                    _json_dumps(payload),
                ),
            )

    def get_prompt_template(self, template_id: str) -> Optional[PromptTemplate]:
        with self._lock, self._registry_connect() as connection:
            row = connection.execute(
                "SELECT template_json FROM prompt_templates WHERE id = ?",
                (template_id,),
            ).fetchone()
        return self._prompt_template_from_json(row["template_json"]) if row else None

    def list_prompt_templates(self, profile_id: str, include_archived: bool = False) -> List[PromptTemplate]:
        query = "SELECT template_json FROM prompt_templates WHERE profile_id = ?"
        params: list[Any] = [profile_id]
        if not include_archived:
            query += " AND status <> ?"
            params.append("archived")
        query += " ORDER BY updated_at DESC, created_at DESC"
        with self._lock, self._registry_connect() as connection:
            rows = connection.execute(query, params).fetchall()
        return [
            template
            for row in rows
            if (template := self._prompt_template_from_json(row["template_json"]))
        ]

    def upsert_calendar_item(self, item: CalendarItem) -> None:
        payload = item.model_dump(by_alias=True)
        with self._lock, self._registry_connect() as connection:
            connection.execute(
                """
                INSERT INTO calendar_items (
                    id, profile_id, title, scheduled_at, platform, status, idea_id,
                    script_id, project_id, notes, created_at, updated_at, item_json
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    profile_id = excluded.profile_id,
                    title = excluded.title,
                    scheduled_at = excluded.scheduled_at,
                    platform = excluded.platform,
                    status = excluded.status,
                    idea_id = excluded.idea_id,
                    script_id = excluded.script_id,
                    project_id = excluded.project_id,
                    notes = excluded.notes,
                    created_at = excluded.created_at,
                    updated_at = excluded.updated_at,
                    item_json = excluded.item_json
                """,
                (
                    item.id,
                    item.profile_id,
                    item.title,
                    item.scheduled_at,
                    item.platform,
                    item.status,
                    item.idea_id,
                    item.script_id,
                    item.project_id,
                    item.notes,
                    item.created_at,
                    item.updated_at,
                    _json_dumps(payload),
                ),
            )

    def get_calendar_item(self, item_id: str) -> Optional[CalendarItem]:
        with self._lock, self._registry_connect() as connection:
            row = connection.execute(
                "SELECT item_json FROM calendar_items WHERE id = ?",
                (item_id,),
            ).fetchone()
        return self._calendar_item_from_json(row["item_json"]) if row else None

    def list_calendar_items(self, profile_id: str, include_archived: bool = False) -> List[CalendarItem]:
        query = "SELECT item_json FROM calendar_items WHERE profile_id = ?"
        params: list[Any] = [profile_id]
        if not include_archived:
            query += " AND status <> ?"
            params.append("archived")
        query += " ORDER BY scheduled_at ASC, updated_at DESC"
        with self._lock, self._registry_connect() as connection:
            rows = connection.execute(query, params).fetchall()
        return [
            item
            for row in rows
            if (item := self._calendar_item_from_json(row["item_json"]))
        ]

    def upsert_experiment(self, experiment: Experiment) -> None:
        payload = experiment.model_dump(by_alias=True)
        with self._lock, self._registry_connect() as connection:
            connection.execute(
                """
                INSERT INTO experiments (
                    id, profile_id, name, platform, status, script_id, project_id,
                    winner_label, created_at, updated_at, experiment_json
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    profile_id = excluded.profile_id,
                    name = excluded.name,
                    platform = excluded.platform,
                    status = excluded.status,
                    script_id = excluded.script_id,
                    project_id = excluded.project_id,
                    winner_label = excluded.winner_label,
                    created_at = excluded.created_at,
                    updated_at = excluded.updated_at,
                    experiment_json = excluded.experiment_json
                """,
                (
                    experiment.id,
                    experiment.profile_id,
                    experiment.name,
                    experiment.platform,
                    experiment.status,
                    experiment.script_id,
                    experiment.project_id,
                    experiment.winner_label,
                    experiment.created_at,
                    experiment.updated_at,
                    _json_dumps(payload),
                ),
            )

    def get_experiment(self, experiment_id: str) -> Optional[Experiment]:
        with self._lock, self._registry_connect() as connection:
            row = connection.execute(
                "SELECT experiment_json FROM experiments WHERE id = ?",
                (experiment_id,),
            ).fetchone()
        return self._experiment_from_json(row["experiment_json"]) if row else None

    def list_experiments(self, profile_id: str, include_archived: bool = False) -> List[Experiment]:
        query = "SELECT experiment_json FROM experiments WHERE profile_id = ?"
        params: list[Any] = [profile_id]
        if not include_archived:
            query += " AND status <> ?"
            params.append("archived")
        query += " ORDER BY updated_at DESC, created_at DESC"
        with self._lock, self._registry_connect() as connection:
            rows = connection.execute(query, params).fetchall()
        return [
            experiment
            for row in rows
            if (experiment := self._experiment_from_json(row["experiment_json"]))
        ]

    def upsert_comment_analysis_run(self, run: CommentAnalysisRun) -> None:
        payload = run.model_dump(by_alias=True)
        with self._lock, self._registry_connect() as connection:
            connection.execute(
                """
                INSERT INTO comment_analysis_runs (
                    id, profile_id, platform, source_label, created_at, updated_at, run_json
                )
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    profile_id = excluded.profile_id,
                    platform = excluded.platform,
                    source_label = excluded.source_label,
                    created_at = excluded.created_at,
                    updated_at = excluded.updated_at,
                    run_json = excluded.run_json
                """,
                (
                    run.id,
                    run.profile_id,
                    run.platform,
                    run.source_label,
                    run.created_at,
                    run.updated_at,
                    _json_dumps(payload),
                ),
            )

    def list_comment_analysis_runs(self, profile_id: str) -> List[CommentAnalysisRun]:
        with self._lock, self._registry_connect() as connection:
            rows = connection.execute(
                """
                SELECT run_json FROM comment_analysis_runs
                WHERE profile_id = ?
                ORDER BY created_at DESC, updated_at DESC
                """,
                (profile_id,),
            ).fetchall()
        return [
            run
            for row in rows
            if (run := self._comment_analysis_run_from_json(row["run_json"]))
        ]

    def upsert_content_idea(self, idea: ContentIdea) -> None:
        payload = idea.model_dump(by_alias=True)
        with self._lock, self._registry_connect() as connection:
            connection.execute(
                """
                INSERT INTO content_ideas (
                    id, profile_id, title, topic, platform, hook, estimated_viral_score,
                    reason_it_may_work, difficulty, target_duration_seconds,
                    suggested_visual_style, status, created_at, updated_at, idea_json
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    profile_id = excluded.profile_id,
                    title = excluded.title,
                    topic = excluded.topic,
                    platform = excluded.platform,
                    hook = excluded.hook,
                    estimated_viral_score = excluded.estimated_viral_score,
                    reason_it_may_work = excluded.reason_it_may_work,
                    difficulty = excluded.difficulty,
                    target_duration_seconds = excluded.target_duration_seconds,
                    suggested_visual_style = excluded.suggested_visual_style,
                    status = excluded.status,
                    created_at = excluded.created_at,
                    updated_at = excluded.updated_at,
                    idea_json = excluded.idea_json
                """,
                (
                    idea.id,
                    idea.profile_id,
                    idea.title,
                    idea.topic,
                    idea.platform,
                    idea.hook,
                    idea.estimated_viral_score,
                    idea.reason_it_may_work,
                    idea.difficulty,
                    idea.target_duration_seconds,
                    idea.suggested_visual_style,
                    idea.status,
                    idea.created_at,
                    idea.updated_at,
                    _json_dumps(payload),
                ),
            )

    def get_content_idea(self, idea_id: str) -> Optional[ContentIdea]:
        with self._lock, self._registry_connect() as connection:
            row = connection.execute("SELECT idea_json FROM content_ideas WHERE id = ?", (idea_id,)).fetchone()
        return self._content_idea_from_json(row["idea_json"]) if row else None

    def list_content_ideas(self, profile_id: str, include_archived: bool = False) -> List[ContentIdea]:
        query = "SELECT idea_json FROM content_ideas WHERE profile_id = ?"
        params: list[Any] = [profile_id]
        if not include_archived:
            query += " AND status <> ?"
            params.append("archived")
        query += " ORDER BY updated_at DESC, created_at DESC"
        with self._lock, self._registry_connect() as connection:
            rows = connection.execute(query, params).fetchall()
        return [idea for row in rows if (idea := self._content_idea_from_json(row["idea_json"]))]

    def upsert_content_trend(self, trend: ContentTrend) -> None:
        payload = trend.model_dump(by_alias=True)
        with self._lock, self._registry_connect() as connection:
            connection.execute(
                """
                INSERT INTO content_trends (
                    id, profile_id, topic, platform, trend_score, platform_relevance,
                    niche_relevance, suggested_angle, suggested_hook,
                    content_idea_suggestions_json, source, status, created_at, updated_at, trend_json
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    profile_id = excluded.profile_id,
                    topic = excluded.topic,
                    platform = excluded.platform,
                    trend_score = excluded.trend_score,
                    platform_relevance = excluded.platform_relevance,
                    niche_relevance = excluded.niche_relevance,
                    suggested_angle = excluded.suggested_angle,
                    suggested_hook = excluded.suggested_hook,
                    content_idea_suggestions_json = excluded.content_idea_suggestions_json,
                    source = excluded.source,
                    status = excluded.status,
                    created_at = excluded.created_at,
                    updated_at = excluded.updated_at,
                    trend_json = excluded.trend_json
                """,
                (
                    trend.id,
                    trend.profile_id,
                    trend.topic,
                    trend.platform,
                    trend.trend_score,
                    trend.platform_relevance,
                    trend.niche_relevance,
                    trend.suggested_angle,
                    trend.suggested_hook,
                    _json_dumps(trend.content_idea_suggestions),
                    trend.source,
                    trend.status,
                    trend.created_at,
                    trend.updated_at,
                    _json_dumps(payload),
                ),
            )

    def get_content_trend(self, trend_id: str) -> Optional[ContentTrend]:
        with self._lock, self._registry_connect() as connection:
            row = connection.execute("SELECT trend_json FROM content_trends WHERE id = ?", (trend_id,)).fetchone()
        return self._content_trend_from_json(row["trend_json"]) if row else None

    def list_content_trends(self, profile_id: str, include_archived: bool = False) -> List[ContentTrend]:
        query = "SELECT trend_json FROM content_trends WHERE profile_id = ?"
        params: list[Any] = [profile_id]
        if not include_archived:
            query += " AND status <> ?"
            params.append("archived")
        query += " ORDER BY updated_at DESC, created_at DESC"
        with self._lock, self._registry_connect() as connection:
            rows = connection.execute(query, params).fetchall()
        return [trend for row in rows if (trend := self._content_trend_from_json(row["trend_json"]))]

    def upsert_script(self, script: Script) -> None:
        payload = script.model_dump(by_alias=True)
        with self._lock, self._registry_connect() as connection:
            connection.execute(
                """
                INSERT INTO scripts (
                    id, profile_id, title, content, idea_id, final_version_id,
                    status, created_at, updated_at, script_json
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    profile_id = excluded.profile_id,
                    title = excluded.title,
                    content = excluded.content,
                    idea_id = excluded.idea_id,
                    final_version_id = excluded.final_version_id,
                    status = excluded.status,
                    created_at = excluded.created_at,
                    updated_at = excluded.updated_at,
                    script_json = excluded.script_json
                """,
                (
                    script.id,
                    script.profile_id,
                    script.title,
                    script.content,
                    script.idea_id,
                    script.final_version_id,
                    script.status,
                    script.created_at,
                    script.updated_at,
                    _json_dumps(payload),
                ),
            )

    def get_script(self, script_id: str) -> Optional[Script]:
        with self._lock, self._registry_connect() as connection:
            row = connection.execute("SELECT script_json FROM scripts WHERE id = ?", (script_id,)).fetchone()
        return self._script_from_json(row["script_json"]) if row else None

    def list_scripts(self, profile_id: str) -> List[Script]:
        with self._lock, self._registry_connect() as connection:
            rows = connection.execute(
                """
                SELECT script_json FROM scripts
                WHERE profile_id = ? AND status <> ?
                ORDER BY updated_at DESC, created_at DESC
                """,
                (profile_id, "archived"),
            ).fetchall()
        return [script for row in rows if (script := self._script_from_json(row["script_json"]))]

    def upsert_script_version(self, version: ScriptVersion) -> None:
        payload = version.model_dump(by_alias=True)
        with self._lock, self._registry_connect() as connection:
            connection.execute(
                """
                INSERT INTO script_versions (
                    id, script_id, label, content, is_selected, created_at, updated_at, version_json
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    script_id = excluded.script_id,
                    label = excluded.label,
                    content = excluded.content,
                    is_selected = excluded.is_selected,
                    created_at = excluded.created_at,
                    updated_at = excluded.updated_at,
                    version_json = excluded.version_json
                """,
                (
                    version.id,
                    version.script_id,
                    version.label,
                    version.content,
                    int(version.is_selected),
                    version.created_at,
                    version.updated_at,
                    _json_dumps(payload),
                ),
            )

    def list_script_versions(self, script_id: str) -> List[ScriptVersion]:
        with self._lock, self._registry_connect() as connection:
            rows = connection.execute(
                """
                SELECT version_json FROM script_versions
                WHERE script_id = ?
                ORDER BY created_at DESC, updated_at DESC
                """,
                (script_id,),
            ).fetchall()
        return [version for row in rows if (version := self._script_version_from_json(row["version_json"]))]

    def mark_selected_script_version(self, script_id: str, selected_version_id: Optional[str]) -> None:
        with self._lock, self._registry_connect() as connection:
            rows = connection.execute(
                "SELECT version_json FROM script_versions WHERE script_id = ?",
                (script_id,),
            ).fetchall()
            for row in rows:
                version = self._script_version_from_json(row["version_json"])
                if not version:
                    continue
                next_selected = bool(selected_version_id and version.id == selected_version_id)
                if version.is_selected == next_selected:
                    continue
                updated = version.model_copy(
                    update={
                        "is_selected": next_selected,
                        "updated_at": _utc_now_iso(),
                    }
                )
                connection.execute(
                    """
                    UPDATE script_versions
                    SET is_selected = ?, updated_at = ?, version_json = ?
                    WHERE id = ?
                    """,
                    (
                        int(updated.is_selected),
                        updated.updated_at,
                        _json_dumps(updated.model_dump(by_alias=True)),
                        updated.id,
                    ),
                )

    def replace_narration_lines(self, script_id: str, lines: List[NarrationLine]) -> None:
        with self._lock, self._registry_connect() as connection:
            connection.execute("DELETE FROM narration_lines WHERE script_id = ?", (script_id,))
            for line in lines:
                connection.execute(
                    """
                    INSERT INTO narration_lines (
                        id, script_id, scene_id, order_index, text, voice_style, emotion,
                        speed, pause_after_seconds, audio_asset_id, duration_seconds,
                        status, error, created_at, updated_at, line_json
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        line.id,
                        line.script_id,
                        line.scene_id,
                        line.index,
                        line.text,
                        line.voice_style,
                        line.emotion,
                        line.speed,
                        line.pause_after_seconds,
                        line.audio_asset_id,
                        line.duration_seconds,
                        line.status,
                        line.error,
                        line.created_at,
                        line.updated_at,
                        _json_dumps(line.model_dump(by_alias=True)),
                    ),
                )

    def upsert_narration_line(self, line: NarrationLine) -> None:
        with self._lock, self._registry_connect() as connection:
            connection.execute(
                """
                INSERT INTO narration_lines (
                    id, script_id, scene_id, order_index, text, voice_style, emotion,
                    speed, pause_after_seconds, audio_asset_id, duration_seconds,
                    status, error, created_at, updated_at, line_json
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    script_id = excluded.script_id,
                    scene_id = excluded.scene_id,
                    order_index = excluded.order_index,
                    text = excluded.text,
                    voice_style = excluded.voice_style,
                    emotion = excluded.emotion,
                    speed = excluded.speed,
                    pause_after_seconds = excluded.pause_after_seconds,
                    audio_asset_id = excluded.audio_asset_id,
                    duration_seconds = excluded.duration_seconds,
                    status = excluded.status,
                    error = excluded.error,
                    created_at = excluded.created_at,
                    updated_at = excluded.updated_at,
                    line_json = excluded.line_json
                """,
                (
                    line.id,
                    line.script_id,
                    line.scene_id,
                    line.index,
                    line.text,
                    line.voice_style,
                    line.emotion,
                    line.speed,
                    line.pause_after_seconds,
                    line.audio_asset_id,
                    line.duration_seconds,
                    line.status,
                    line.error,
                    line.created_at,
                    line.updated_at,
                    _json_dumps(line.model_dump(by_alias=True)),
                ),
            )

    def get_narration_line(self, line_id: str) -> Optional[NarrationLine]:
        with self._lock, self._registry_connect() as connection:
            row = connection.execute(
                "SELECT line_json FROM narration_lines WHERE id = ?",
                (line_id,),
            ).fetchone()
        return self._narration_line_from_json(row["line_json"]) if row else None

    def list_narration_lines(self, script_id: str) -> List[NarrationLine]:
        with self._lock, self._registry_connect() as connection:
            rows = connection.execute(
                """
                SELECT line_json FROM narration_lines
                WHERE script_id = ?
                ORDER BY order_index ASC
                """,
                (script_id,),
            ).fetchall()
        return [line for row in rows if (line := self._narration_line_from_json(row["line_json"]))]

    def upsert_workflow_run(self, workflow: WorkflowRun) -> None:
        payload = workflow.model_dump(by_alias=True)
        with self._lock, self._registry_connect() as connection:
            connection.execute(
                """
                INSERT INTO workflow_runs (
                    id, profile_id, project_id, workflow_type, input_json, output_json,
                    status, error_message, created_at, updated_at, workflow_json
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    profile_id = excluded.profile_id,
                    project_id = excluded.project_id,
                    workflow_type = excluded.workflow_type,
                    input_json = excluded.input_json,
                    output_json = excluded.output_json,
                    status = excluded.status,
                    error_message = excluded.error_message,
                    created_at = excluded.created_at,
                    updated_at = excluded.updated_at,
                    workflow_json = excluded.workflow_json
                """,
                (
                    workflow.id,
                    workflow.profile_id,
                    workflow.project_id,
                    workflow.workflow_type,
                    _json_dumps(workflow.input_json),
                    _json_dumps(workflow.output_json),
                    workflow.status,
                    workflow.error_message,
                    workflow.created_at,
                    workflow.updated_at,
                    _json_dumps(payload),
                ),
            )

    def get_workflow_run(self, workflow_id: str) -> Optional[WorkflowRun]:
        with self._lock, self._registry_connect() as connection:
            row = connection.execute(
                "SELECT workflow_json FROM workflow_runs WHERE id = ?",
                (workflow_id,),
            ).fetchone()
        return self._workflow_run_from_json(row["workflow_json"]) if row else None

    def upsert_agent_run(self, run: AgentRun) -> None:
        payload = run.model_dump(by_alias=True)
        with self._lock, self._registry_connect() as connection:
            connection.execute(
                """
                INSERT INTO agent_runs (
                    id, workflow_run_id, profile_id, project_id, agent_name, input_json,
                    output_json, status, error_message, created_at, updated_at, run_json
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    workflow_run_id = excluded.workflow_run_id,
                    profile_id = excluded.profile_id,
                    project_id = excluded.project_id,
                    agent_name = excluded.agent_name,
                    input_json = excluded.input_json,
                    output_json = excluded.output_json,
                    status = excluded.status,
                    error_message = excluded.error_message,
                    created_at = excluded.created_at,
                    updated_at = excluded.updated_at,
                    run_json = excluded.run_json
                """,
                (
                    run.id,
                    run.workflow_run_id,
                    run.profile_id,
                    run.project_id,
                    run.agent_name,
                    _json_dumps(run.input_json),
                    _json_dumps(run.output_json),
                    run.status,
                    run.error_message,
                    run.created_at,
                    run.updated_at,
                    _json_dumps(payload),
                ),
            )

    def list_agent_runs(
        self,
        profile_id: Optional[str] = None,
        workflow_run_id: Optional[str] = None,
    ) -> List[AgentRun]:
        where: List[str] = []
        params: List[Any] = []
        if profile_id:
            where.append("profile_id = ?")
            params.append(profile_id)
        if workflow_run_id:
            where.append("workflow_run_id = ?")
            params.append(workflow_run_id)
        query = "SELECT run_json FROM agent_runs"
        if where:
            query += f" WHERE {' AND '.join(where)}"
        query += " ORDER BY created_at DESC, updated_at DESC"
        with self._lock, self._registry_connect() as connection:
            rows = connection.execute(query, params).fetchall()
        runs = [run for row in rows if (run := self._agent_run_from_json(row["run_json"]))]
        if workflow_run_id:
            return list(reversed(runs))
        return runs

    def get_agent_run(self, run_id: str) -> Optional[AgentRun]:
        with self._lock, self._registry_connect() as connection:
            row = connection.execute("SELECT run_json FROM agent_runs WHERE id = ?", (run_id,)).fetchone()
        return self._agent_run_from_json(row["run_json"]) if row else None

    def upsert_analytics_account(self, account: AnalyticsAccount) -> None:
        payload = account.model_dump(by_alias=True)
        with self._lock, self._registry_connect() as connection:
            connection.execute(
                """
                INSERT INTO analytics_accounts (
                    id, platform, external_account_id, display_name, token_reference,
                    metadata_json, created_at, updated_at, account_json
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    platform = excluded.platform,
                    external_account_id = excluded.external_account_id,
                    display_name = excluded.display_name,
                    token_reference = excluded.token_reference,
                    metadata_json = excluded.metadata_json,
                    created_at = excluded.created_at,
                    updated_at = excluded.updated_at,
                    account_json = excluded.account_json
                """,
                (
                    account.id,
                    account.platform,
                    account.external_account_id,
                    account.display_name,
                    account.token_reference,
                    _json_dumps(account.metadata),
                    account.created_at,
                    account.updated_at,
                    _json_dumps(payload),
                ),
            )

    def upsert_analytics_connection(self, connection_model: AnalyticsConnection) -> None:
        payload = connection_model.model_dump(by_alias=True)
        with self._lock, self._registry_connect() as connection:
            connection.execute(
                """
                INSERT INTO analytics_connections (
                    id, profile_id, platform, account_id, status, external_account_id,
                    display_name, scopes_json, token_reference, metadata_json,
                    created_at, updated_at, connection_json
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(profile_id, platform) DO UPDATE SET
                    id = excluded.id,
                    account_id = excluded.account_id,
                    status = excluded.status,
                    external_account_id = excluded.external_account_id,
                    display_name = excluded.display_name,
                    scopes_json = excluded.scopes_json,
                    token_reference = excluded.token_reference,
                    metadata_json = excluded.metadata_json,
                    created_at = excluded.created_at,
                    updated_at = excluded.updated_at,
                    connection_json = excluded.connection_json
                """,
                (
                    connection_model.id,
                    connection_model.profile_id,
                    connection_model.platform,
                    connection_model.account_id,
                    connection_model.status,
                    connection_model.external_account_id,
                    connection_model.display_name,
                    _json_dumps(connection_model.scopes),
                    connection_model.token_reference,
                    _json_dumps(connection_model.metadata),
                    connection_model.created_at,
                    connection_model.updated_at,
                    _json_dumps(payload),
                ),
            )

    def get_analytics_connection(
        self,
        profile_id: str,
        platform: str,
    ) -> Optional[AnalyticsConnection]:
        with self._lock, self._registry_connect() as connection:
            row = connection.execute(
                """
                SELECT connection_json FROM analytics_connections
                WHERE profile_id = ? AND platform = ?
                """,
                (profile_id, platform),
            ).fetchone()
        return self._analytics_connection_from_json(row["connection_json"]) if row else None

    def list_analytics_connections(self, profile_id: str) -> List[AnalyticsConnection]:
        with self._lock, self._registry_connect() as connection:
            rows = connection.execute(
                """
                SELECT connection_json FROM analytics_connections
                WHERE profile_id = ?
                ORDER BY platform ASC
                """,
                (profile_id,),
            ).fetchall()
        return [
            connection_model
            for row in rows
            if (connection_model := self._analytics_connection_from_json(row["connection_json"]))
        ]

    def upsert_analytics_snapshot(self, snapshot: AnalyticsSnapshot) -> None:
        payload = snapshot.model_dump(by_alias=True)
        with self._lock, self._registry_connect() as connection:
            connection.execute(
                """
                INSERT INTO analytics_snapshots (
                    id, profile_id, project_id, platform, external_content_id,
                    captured_at, metrics_json, metadata_json, created_at, updated_at, snapshot_json
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    profile_id = excluded.profile_id,
                    project_id = excluded.project_id,
                    platform = excluded.platform,
                    external_content_id = excluded.external_content_id,
                    captured_at = excluded.captured_at,
                    metrics_json = excluded.metrics_json,
                    metadata_json = excluded.metadata_json,
                    created_at = excluded.created_at,
                    updated_at = excluded.updated_at,
                    snapshot_json = excluded.snapshot_json
                """,
                (
                    snapshot.id,
                    snapshot.profile_id,
                    snapshot.project_id,
                    snapshot.platform,
                    snapshot.external_content_id,
                    snapshot.captured_at,
                    _json_dumps(snapshot.metrics.model_dump(by_alias=True)),
                    _json_dumps(snapshot.metadata),
                    snapshot.created_at,
                    snapshot.updated_at,
                    _json_dumps(payload),
                ),
            )

    def upsert_content_performance(self, performance: ContentPerformance) -> None:
        payload = performance.model_dump(by_alias=True)
        with self._lock, self._registry_connect() as connection:
            connection.execute(
                """
                INSERT INTO content_performance (
                    id, profile_id, project_id, platform, external_content_id, title,
                    published_at, posting_time, video_length_seconds, hook_type, caption_style,
                    voice_style, visual_style, traffic_source, metrics_json, metadata_json,
                    created_at, updated_at, performance_json
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    profile_id = excluded.profile_id,
                    project_id = excluded.project_id,
                    platform = excluded.platform,
                    external_content_id = excluded.external_content_id,
                    title = excluded.title,
                    published_at = excluded.published_at,
                    posting_time = excluded.posting_time,
                    video_length_seconds = excluded.video_length_seconds,
                    hook_type = excluded.hook_type,
                    caption_style = excluded.caption_style,
                    voice_style = excluded.voice_style,
                    visual_style = excluded.visual_style,
                    traffic_source = excluded.traffic_source,
                    metrics_json = excluded.metrics_json,
                    metadata_json = excluded.metadata_json,
                    created_at = excluded.created_at,
                    updated_at = excluded.updated_at,
                    performance_json = excluded.performance_json
                """,
                (
                    performance.id,
                    performance.profile_id,
                    performance.project_id,
                    performance.platform,
                    performance.external_content_id,
                    performance.title,
                    performance.published_at,
                    performance.posting_time,
                    performance.video_length_seconds,
                    performance.hook_type,
                    performance.caption_style,
                    performance.voice_style,
                    performance.visual_style,
                    performance.traffic_source,
                    _json_dumps(performance.metrics.model_dump(by_alias=True)),
                    _json_dumps(performance.metadata),
                    performance.created_at,
                    performance.updated_at,
                    _json_dumps(payload),
                ),
            )

    def list_content_performance(self, profile_id: str) -> List[ContentPerformance]:
        with self._lock, self._registry_connect() as connection:
            rows = connection.execute(
                """
                SELECT performance_json FROM content_performance
                WHERE profile_id = ?
                ORDER BY updated_at DESC, created_at DESC
                """,
                (profile_id,),
            ).fetchall()
        return [
            performance
            for row in rows
            if (performance := self._content_performance_from_json(row["performance_json"]))
        ]

    def upsert_competitor_content(self, item: CompetitorContent) -> None:
        payload = item.model_dump(by_alias=True)
        with self._lock, self._registry_connect() as connection:
            connection.execute(
                """
                INSERT INTO competitor_content (
                    id, profile_id, competitor_name, platform, title, content_url, published_at,
                    topic, hook, format, video_length_seconds, views, likes, comments, shares,
                    notes, status, created_at, updated_at, content_json
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    profile_id = excluded.profile_id,
                    competitor_name = excluded.competitor_name,
                    platform = excluded.platform,
                    title = excluded.title,
                    content_url = excluded.content_url,
                    published_at = excluded.published_at,
                    topic = excluded.topic,
                    hook = excluded.hook,
                    format = excluded.format,
                    video_length_seconds = excluded.video_length_seconds,
                    views = excluded.views,
                    likes = excluded.likes,
                    comments = excluded.comments,
                    shares = excluded.shares,
                    notes = excluded.notes,
                    status = excluded.status,
                    created_at = excluded.created_at,
                    updated_at = excluded.updated_at,
                    content_json = excluded.content_json
                """,
                (
                    item.id,
                    item.profile_id,
                    item.competitor_name,
                    item.platform,
                    item.title,
                    item.content_url,
                    item.published_at,
                    item.topic,
                    item.hook,
                    item.format,
                    item.video_length_seconds,
                    item.views,
                    item.likes,
                    item.comments,
                    item.shares,
                    item.notes,
                    item.status,
                    item.created_at,
                    item.updated_at,
                    _json_dumps(payload),
                ),
            )

    def get_competitor_content(self, item_id: str) -> Optional[CompetitorContent]:
        with self._lock, self._registry_connect() as connection:
            row = connection.execute(
                "SELECT content_json FROM competitor_content WHERE id = ?",
                (item_id,),
            ).fetchone()
        return self._competitor_content_from_json(row["content_json"]) if row else None

    def list_competitor_content(self, profile_id: str, include_archived: bool = False) -> List[CompetitorContent]:
        query = "SELECT content_json FROM competitor_content WHERE profile_id = ?"
        params: list[Any] = [profile_id]
        if not include_archived:
            query += " AND status <> ?"
            params.append("archived")
        query += " ORDER BY updated_at DESC, created_at DESC"
        with self._lock, self._registry_connect() as connection:
            rows = connection.execute(query, params).fetchall()
        return [
            item
            for row in rows
            if (item := self._competitor_content_from_json(row["content_json"]))
        ]

    def upsert_publishing_destination(self, destination: PublishingDestination) -> None:
        payload = destination.model_dump(by_alias=True)
        with self._lock, self._registry_connect() as connection:
            connection.execute(
                """
                INSERT INTO publishing_destinations (
                    id, profile_id, platform, status, external_account_id, display_name,
                    token_reference, metadata_json, created_at, updated_at, destination_json
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    profile_id = excluded.profile_id,
                    platform = excluded.platform,
                    status = excluded.status,
                    external_account_id = excluded.external_account_id,
                    display_name = excluded.display_name,
                    token_reference = excluded.token_reference,
                    metadata_json = excluded.metadata_json,
                    created_at = excluded.created_at,
                    updated_at = excluded.updated_at,
                    destination_json = excluded.destination_json
                """,
                (
                    destination.id,
                    destination.profile_id,
                    destination.platform,
                    destination.status,
                    destination.external_account_id,
                    destination.display_name,
                    destination.token_reference,
                    _json_dumps(destination.metadata),
                    destination.created_at,
                    destination.updated_at,
                    _json_dumps(payload),
                ),
            )

    def get_publishing_destination(
        self,
        profile_id: str,
        platform: str,
    ) -> Optional[PublishingDestination]:
        with self._lock, self._registry_connect() as connection:
            row = connection.execute(
                """
                SELECT destination_json FROM publishing_destinations
                WHERE profile_id = ? AND platform = ?
                """,
                (profile_id, platform),
            ).fetchone()
        return self._publishing_destination_from_json(row["destination_json"]) if row else None

    def list_publishing_destinations(self, profile_id: str) -> List[PublishingDestination]:
        with self._lock, self._registry_connect() as connection:
            rows = connection.execute(
                """
                SELECT destination_json FROM publishing_destinations
                WHERE profile_id = ?
                ORDER BY platform ASC
                """,
                (profile_id,),
            ).fetchall()
        return [
            destination
            for row in rows
            if (destination := self._publishing_destination_from_json(row["destination_json"]))
        ]

    def upsert_publish_job(self, job: PublishJob) -> None:
        payload = job.model_dump(by_alias=True)
        with self._lock, self._registry_connect() as connection:
            connection.execute(
                """
                INSERT INTO publish_jobs (
                    id, profile_id, platform, title, scheduled_at, calendar_item_id, project_id,
                    status, external_post_id, provider_status, error, created_at, updated_at, job_json
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    profile_id = excluded.profile_id,
                    platform = excluded.platform,
                    title = excluded.title,
                    scheduled_at = excluded.scheduled_at,
                    calendar_item_id = excluded.calendar_item_id,
                    project_id = excluded.project_id,
                    status = excluded.status,
                    external_post_id = excluded.external_post_id,
                    provider_status = excluded.provider_status,
                    error = excluded.error,
                    created_at = excluded.created_at,
                    updated_at = excluded.updated_at,
                    job_json = excluded.job_json
                """,
                (
                    job.id,
                    job.profile_id,
                    job.platform,
                    job.title,
                    job.scheduled_at,
                    job.calendar_item_id,
                    job.project_id,
                    job.status,
                    job.external_post_id,
                    job.provider_status,
                    job.error,
                    job.created_at,
                    job.updated_at,
                    _json_dumps(payload),
                ),
            )

    def get_publish_job(self, job_id: str) -> Optional[PublishJob]:
        with self._lock, self._registry_connect() as connection:
            row = connection.execute(
                "SELECT job_json FROM publish_jobs WHERE id = ?",
                (job_id,),
            ).fetchone()
        return self._publish_job_from_json(row["job_json"]) if row else None

    def list_publish_jobs(self, profile_id: str, include_archived: bool = False) -> List[PublishJob]:
        query = "SELECT job_json FROM publish_jobs WHERE profile_id = ?"
        params: list[Any] = [profile_id]
        if not include_archived:
            query += " AND status <> ?"
            params.append("archived")
        query += " ORDER BY updated_at DESC, created_at DESC"
        with self._lock, self._registry_connect() as connection:
            rows = connection.execute(query, params).fetchall()
        return [
            job
            for row in rows
            if (job := self._publish_job_from_json(row["job_json"]))
        ]

    def replace_profile_learnings(self, profile_id: str, learnings: List[ProfileLearning]) -> None:
        with self._lock, self._registry_connect() as connection:
            connection.execute("DELETE FROM profile_learnings WHERE profile_id = ?", (profile_id,))
            for learning in learnings:
                connection.execute(
                    """
                    INSERT INTO profile_learnings (
                        id, profile_id, learning_type, learning_json, created_at, updated_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    (
                        learning.id,
                        learning.profile_id,
                        learning.learning_type,
                        _json_dumps(learning.model_dump(by_alias=True)),
                        learning.created_at,
                        learning.updated_at,
                    ),
                )

    def list_profile_learnings(self, profile_id: str) -> List[ProfileLearning]:
        with self._lock, self._registry_connect() as connection:
            rows = connection.execute(
                """
                SELECT learning_json FROM profile_learnings
                WHERE profile_id = ?
                ORDER BY updated_at DESC, created_at DESC
                """,
                (profile_id,),
            ).fetchall()
        return [
            learning
            for row in rows
            if (learning := self._profile_learning_from_json(row["learning_json"]))
        ]

    def replace_content_performance_rules(
        self,
        profile_id: str,
        rules: List[ContentPerformanceRule],
    ) -> None:
        with self._lock, self._registry_connect() as connection:
            connection.execute("DELETE FROM content_performance_rules WHERE profile_id = ?", (profile_id,))
            for rule in rules:
                connection.execute(
                    """
                    INSERT INTO content_performance_rules (
                        id, profile_id, rule_key, rule_json, created_at, updated_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    (
                        rule.id,
                        rule.profile_id,
                        rule.rule_key,
                        _json_dumps(rule.model_dump(by_alias=True)),
                        rule.created_at,
                        rule.updated_at,
                    ),
                )

    def list_content_performance_rules(self, profile_id: str) -> List[ContentPerformanceRule]:
        with self._lock, self._registry_connect() as connection:
            rows = connection.execute(
                """
                SELECT rule_json FROM content_performance_rules
                WHERE profile_id = ?
                ORDER BY updated_at DESC, created_at DESC
                """,
                (profile_id,),
            ).fetchall()
        return [
            rule
            for row in rows
            if (rule := self._content_performance_rule_from_json(row["rule_json"]))
        ]

    def get_project(self, project_id: str) -> Optional[ProjectDetail]:
        row = self._registry_project_row(project_id)
        if not row:
            return None
        database_path = Path(row["database_path"])
        if not database_path.exists():
            return self._project_from_registry_row(row)
        try:
            with self._lock, self._project_connect(database_path) as connection:
                self._initialize_project_database(connection)
                project_row = connection.execute(
                    "SELECT * FROM projects WHERE id = ?",
                    (project_id,),
                ).fetchone()
                if not project_row:
                    return self._project_from_registry_row(row)
                return self._project_from_project_db_row(connection, project_row)
        except sqlite3.OperationalError:
            project = self._read_project_database_read_only(database_path, project_id=project_id)
            return project or self._project_from_registry_row(row)

    def get_project_from_database_path(self, database_path: Path) -> Optional[ProjectDetail]:
        if database_path.is_dir():
            database_path = database_path / PROJECT_DATABASE_NAME
        if not database_path.exists():
            return None
        try:
            with self._lock, self._project_connect(database_path) as connection:
                self._initialize_project_database(connection)
                row = connection.execute("SELECT * FROM projects LIMIT 1").fetchone()
                if not row:
                    return None
                project = self._project_from_project_db_row(connection, row)
                self._upsert_registry_project(project, database_path)
                return project
        except sqlite3.OperationalError:
            project = self._read_project_database_read_only(database_path)
            if project:
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
                try:
                    with self._project_connect(database_path) as connection:
                        self._initialize_project_database(connection)
                        self._set_paused_batches(connection, paused_by_project.get(project_id, set()))
                        for sort_order, job in indexed_jobs:
                            self._upsert_generation_job_row(connection, job, sort_order)
                except sqlite3.OperationalError:
                    continue

    def load_generation_state(self) -> Tuple[List[GenerationJob], List[str], set[str]]:
        jobs: List[GenerationJob] = []
        order: List[str] = []
        paused: set[str] = set()
        with self._lock:
            for project in self.list_projects():
                database_path = self._project_database_path_for_id(project.id)
                if not database_path or not database_path.exists():
                    continue
                try:
                    with self._project_connect(database_path) as connection:
                        self._initialize_project_database(connection)
                        for job in self._load_jobs_from_connection(connection):
                            jobs.append(job)
                            order.append(job.id)
                        for row in connection.execute("SELECT id FROM generation_batches WHERE paused = 1").fetchall():
                            paused.add(self._batch_key(row["id"], project.id))
                except sqlite3.OperationalError:
                    continue
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
                try:
                    with self._project_connect(database_path) as connection:
                        self._initialize_project_database(connection)
                        self._recover_stale_running_jobs(connection, provider)
                        params: list[Any] = ["queued"]
                        where = ["status = ?", "batch_id NOT IN (SELECT id FROM generation_batches WHERE paused = 1)"]
                        if provider:
                            where.append("provider = ?")
                            params.append(provider)
                        rows = connection.execute(
                            f"""
                            SELECT job_json FROM generation_jobs
                            WHERE {" AND ".join(where)}
                            ORDER BY sort_order ASC, created_at ASC
                            LIMIT 50
                            """,
                            params,
                        ).fetchall()
                        if not rows:
                            continue
                        job = None
                        for row in rows:
                            candidate = self._job_from_json(row["job_json"])
                            if not candidate:
                                continue
                            assigned_worker_id = candidate.metadata.get("assignedWorkerId")
                            if assigned_worker_id and assigned_worker_id != worker_id:
                                continue
                            job = candidate
                            break
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
                except sqlite3.OperationalError:
                    continue
        return None

    def upsert_generation_job(self, job: GenerationJob, sort_order: int = 0) -> None:
        if not job.project_id:
            return
        database_path = self._project_database_path_for_id(job.project_id)
        if not database_path:
            return
        try:
            with self._lock, self._project_connect(database_path) as connection:
                self._initialize_project_database(connection)
                self._upsert_generation_job_row(connection, job, sort_order)
        except sqlite3.OperationalError:
            return

    def clear_generation_jobs(
        self,
        project_id: Optional[str],
        provider: Optional[ProviderName],
        worker_id: Optional[str],
        flow: Optional[str],
        media_type: Optional[GeneratedMediaType],
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
                try:
                    with self._project_connect(database_path) as connection:
                        self._initialize_project_database(connection)
                        placeholders = ",".join("?" for _ in status_values)
                        params: list[Any] = [*status_values]
                        where = [f"status IN ({placeholders})"]
                        if provider:
                            where.append("provider = ?")
                            params.append(provider)
                        if worker_id:
                            where.append("worker_id = ?")
                            params.append(worker_id)
                        if media_type:
                            where.append("media_type = ?")
                            params.append(media_type)
                        rows = connection.execute(
                            f"SELECT id, job_json FROM generation_jobs WHERE {' AND '.join(where)}",
                            params,
                        ).fetchall()
                        removed_ids = {
                            row["id"]
                            for row in rows
                            if not flow or self._job_json_matches_flow(row["job_json"], flow)
                        }
                        if not removed_ids:
                            continue
                        delete_placeholders = ",".join("?" for _ in removed_ids)
                        result = connection.execute(
                            f"DELETE FROM generation_jobs WHERE id IN ({delete_placeholders})",
                            list(removed_ids),
                        )
                        deleted += result.rowcount if result.rowcount is not None else 0
                        if removed_ids:
                            self._remove_generation_jobs_from_project_file(connection, removed_ids)
                except sqlite3.OperationalError:
                    continue
        return deleted

    def _read_project_database_read_only(
        self,
        database_path: Path,
        project_id: Optional[str] = None,
    ) -> Optional[ProjectDetail]:
        try:
            with self._lock, self._project_read_only_connect(database_path) as connection:
                query = "SELECT * FROM projects WHERE id = ?" if project_id else "SELECT * FROM projects LIMIT 1"
                params = (project_id,) if project_id else ()
                row = connection.execute(query, params).fetchone()
                if not row:
                    return None
                return self._project_from_project_db_row(connection, row)
        except sqlite3.OperationalError:
            return None

    def _job_json_matches_flow(self, job_json: str, flow: str) -> bool:
        job = self._job_from_json(job_json)
        if not job:
            return False
        return job.metadata.get("flow", "auto_generate") == flow

    def _remove_generation_jobs_from_project_file(
        self,
        connection: sqlite3.Connection,
        removed_ids: set[str],
    ) -> None:
        project_row = connection.execute("SELECT project_file_path FROM projects LIMIT 1").fetchone()
        if not project_row:
            return
        project_file = Path(project_row["project_file_path"])
        if not project_file.exists():
            return
        try:
            raw = json.loads(project_file.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError, TypeError):
            return
        state = raw.get("state")
        if not isinstance(state, dict):
            return

        changed = False
        for key in ("generationJobs", "animationAssetJobs"):
            values = state.get(key)
            if not isinstance(values, list):
                continue
            filtered = [item for item in values if not (isinstance(item, dict) and item.get("id") in removed_ids)]
            if len(filtered) != len(values):
                state[key] = filtered
                changed = True

        media_assets = state.get("generatedMediaAssets")
        if isinstance(media_assets, list):
            filtered_media = [
                item for item in media_assets
                if not (isinstance(item, dict) and item.get("jobId") in removed_ids)
            ]
            if len(filtered_media) != len(media_assets):
                state["generatedMediaAssets"] = filtered_media
                changed = True

        if changed:
            try:
                project_file.write_text(json.dumps(raw, indent=2), encoding="utf-8")
            except OSError:
                return

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
                    database_path, created_at, updated_at, last_opened_at,
                    content_profile_id, target_platform, content_goal, video_type,
                    planned_title, planned_description, script_id
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    name = excluded.name,
                    folder_path = excluded.folder_path,
                    generated_media_path = excluded.generated_media_path,
                    project_file_path = excluded.project_file_path,
                    database_path = excluded.database_path,
                    created_at = excluded.created_at,
                    updated_at = excluded.updated_at,
                    last_opened_at = excluded.last_opened_at,
                    content_profile_id = excluded.content_profile_id,
                    target_platform = excluded.target_platform,
                    content_goal = excluded.content_goal,
                    video_type = excluded.video_type,
                    planned_title = excluded.planned_title,
                    planned_description = excluded.planned_description,
                    script_id = excluded.script_id
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
                    project.content_profile_id,
                    project.target_platform,
                    project.content_goal,
                    project.video_type,
                    project.planned_title,
                    project.planned_description,
                    project.script_id,
                ),
            )

    def _upsert_project_row(self, connection: sqlite3.Connection, project: ProjectDetail) -> None:
        connection.execute(
            """
            INSERT INTO projects (
                id, name, folder_path, generated_media_path, project_file_path,
                created_at, updated_at, content_profile_id, target_platform,
                content_goal, video_type, planned_title, planned_description, script_id
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                folder_path = excluded.folder_path,
                generated_media_path = excluded.generated_media_path,
                project_file_path = excluded.project_file_path,
                created_at = excluded.created_at,
                updated_at = excluded.updated_at,
                content_profile_id = excluded.content_profile_id,
                target_platform = excluded.target_platform,
                content_goal = excluded.content_goal,
                video_type = excluded.video_type,
                planned_title = excluded.planned_title,
                planned_description = excluded.planned_description,
                script_id = excluded.script_id
            """,
            (
                project.id,
                project.name,
                project.folder_path,
                project.generated_media_path,
                project.project_file_path,
                project.created_at,
                project.updated_at,
                project.content_profile_id,
                project.target_platform,
                project.content_goal,
                project.video_type,
                project.planned_title,
                project.planned_description,
                project.script_id,
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
                "animationSettings": state.get("animationSettings"),
                "animationPlan": state.get("animationPlan"),
                "animationAssetLibrary": state.get("animationAssetLibrary"),
                "currentAnimationBatchId": state.get("currentAnimationBatchId"),
            },
        )
        self._replace_media_assets(connection, state.get("assets", []))
        self._replace_timeline_tracks(connection, state.get("tracks", []))
        self._replace_timeline_clips(connection, state.get("clips", []))
        self._replace_captions(connection, state.get("captions", []))
        self._replace_storyboard_scenes(connection, state.get("storyboardScenes", []))

        jobs = []
        if isinstance(state.get("generationJobs"), list):
            jobs.extend(state.get("generationJobs", []))
        if isinstance(state.get("animationAssetJobs"), list):
            jobs.extend(state.get("animationAssetJobs", []))
        if jobs:
            seen_job_ids: set[str] = set()
            for index, item in enumerate(jobs):
                try:
                    job = GenerationJob(**item)
                except ValueError:
                    continue
                if job.id in seen_job_ids:
                    continue
                seen_job_ids.add(job.id)
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
            contentProfileId=row["content_profile_id"] if "content_profile_id" in row.keys() else None,
            targetPlatform=row["target_platform"] if "target_platform" in row.keys() else None,
            contentGoal=row["content_goal"] if "content_goal" in row.keys() else "",
            videoType=row["video_type"] if "video_type" in row.keys() else "",
            plannedTitle=row["planned_title"] if "planned_title" in row.keys() else "",
            plannedDescription=row["planned_description"] if "planned_description" in row.keys() else "",
            scriptId=row["script_id"] if "script_id" in row.keys() else None,
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
        loaded_jobs = self._load_jobs_from_connection(connection)
        jobs = [job.model_dump(by_alias=True) for job in loaded_jobs if job.metadata.get("flow") != "auto_animate"]
        animation_jobs = [job.model_dump(by_alias=True) for job in loaded_jobs if job.metadata.get("flow") == "auto_animate"]
        generated_media_assets = [
            asset.model_dump(by_alias=True)
            for asset in self._generated_assets_from_jobs(loaded_jobs)
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
                "contentProfileId": project_row["content_profile_id"] if "content_profile_id" in project_row.keys() else None,
                "targetPlatform": project_row["target_platform"] if "target_platform" in project_row.keys() else None,
                "contentGoal": project_row["content_goal"] if "content_goal" in project_row.keys() else "",
                "videoType": project_row["video_type"] if "video_type" in project_row.keys() else "",
                "plannedTitle": project_row["planned_title"] if "planned_title" in project_row.keys() else "",
                "plannedDescription": project_row["planned_description"] if "planned_description" in project_row.keys() else "",
                "scriptId": project_row["script_id"] if "script_id" in project_row.keys() else None,
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
            "animationSettings": settings.get("animationSettings"),
            "animationPlan": settings.get("animationPlan"),
            "animationAssetLibrary": settings.get("animationAssetLibrary"),
            "animationAssetJobs": animation_jobs,
            "currentAnimationBatchId": settings.get("currentAnimationBatchId"),
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

    def _content_profile_from_row(self, row: sqlite3.Row) -> Optional[ContentProfile]:
        payload = _json_loads(row["profile_json"], {})
        if isinstance(payload, dict):
            try:
                return ContentProfile(**payload)
            except ValueError:
                pass
        try:
            return ContentProfile(
                id=row["id"],
                name=row["name"],
                description=row["description"],
                avatarPath=row["avatar_path"],
                platforms=_json_loads(row["platforms_json"], ["youtube_shorts"]),
                contentType=row["content_type"],
                targetAudience=row["target_audience"],
                language=row["language"],
                tone=row["tone"],
                defaultVideoLengthSeconds=row["default_video_length_seconds"],
                voiceStyle=row["voice_style"],
                visualStyle=row["visual_style"],
                hookStyle=row["hook_style"],
                captionStyle=row["caption_style"],
                brandColors=_json_loads(row["brand_colors_json"], []),
                competitors=_json_loads(row["competitors_json"], []),
                postingGoals=row["posting_goals"],
                analyticsConnectionStatus=_json_loads(row["analytics_connection_status_json"], {}),
                isArchived=bool(row["is_archived"]),
                archivedAt=row["archived_at"],
                createdAt=row["created_at"],
                updatedAt=row["updated_at"],
            )
        except ValueError:
            return None

    def _content_idea_from_json(self, raw: str) -> Optional[ContentIdea]:
        try:
            return ContentIdea(**_json_loads(raw, {}))
        except ValueError:
            return None

    def _content_trend_from_json(self, raw: str) -> Optional[ContentTrend]:
        try:
            return ContentTrend(**_json_loads(raw, {}))
        except ValueError:
            return None

    def _script_from_json(self, raw: str) -> Optional[Script]:
        try:
            return Script(**_json_loads(raw, {}))
        except ValueError:
            return None

    def _script_version_from_json(self, raw: str) -> Optional[ScriptVersion]:
        try:
            return ScriptVersion(**_json_loads(raw, {}))
        except ValueError:
            return None

    def _narration_line_from_json(self, raw: str) -> Optional[NarrationLine]:
        try:
            return NarrationLine(**_json_loads(raw, {}))
        except ValueError:
            return None

    def _workflow_run_from_json(self, raw: str) -> Optional[WorkflowRun]:
        try:
            return WorkflowRun(**_json_loads(raw, {}))
        except ValueError:
            return None

    def _agent_run_from_json(self, raw: str) -> Optional[AgentRun]:
        try:
            return AgentRun(**_json_loads(raw, {}))
        except ValueError:
            return None

    def _analytics_connection_from_json(self, raw: str) -> Optional[AnalyticsConnection]:
        try:
            return AnalyticsConnection(**_json_loads(raw, {}))
        except ValueError:
            return None

    def _content_performance_from_json(self, raw: str) -> Optional[ContentPerformance]:
        try:
            return ContentPerformance(**_json_loads(raw, {}))
        except ValueError:
            return None

    def _competitor_content_from_json(self, raw: str) -> Optional[CompetitorContent]:
        try:
            return CompetitorContent(**_json_loads(raw, {}))
        except ValueError:
            return None

    def _character_profile_from_json(self, raw: str) -> Optional[CharacterProfile]:
        try:
            return CharacterProfile(**_json_loads(raw, {}))
        except ValueError:
            return None

    def _comment_analysis_run_from_json(self, raw: str) -> Optional[CommentAnalysisRun]:
        try:
            return CommentAnalysisRun(**_json_loads(raw, {}))
        except ValueError:
            return None

    def _brand_kit_from_json(self, raw: str) -> Optional[BrandKit]:
        try:
            return BrandKit(**_json_loads(raw, {}))
        except ValueError:
            return None

    def _prompt_template_from_json(self, raw: str) -> Optional[PromptTemplate]:
        try:
            return PromptTemplate(**_json_loads(raw, {}))
        except ValueError:
            return None

    def _calendar_item_from_json(self, raw: str) -> Optional[CalendarItem]:
        try:
            return CalendarItem(**_json_loads(raw, {}))
        except ValueError:
            return None

    def _experiment_from_json(self, raw: str) -> Optional[Experiment]:
        try:
            return Experiment(**_json_loads(raw, {}))
        except ValueError:
            return None

    def _publishing_destination_from_json(self, raw: str) -> Optional[PublishingDestination]:
        try:
            return PublishingDestination(**_json_loads(raw, {}))
        except ValueError:
            return None

    def _publish_job_from_json(self, raw: str) -> Optional[PublishJob]:
        try:
            return PublishJob(**_json_loads(raw, {}))
        except ValueError:
            return None

    def _profile_learning_from_json(self, raw: str) -> Optional[ProfileLearning]:
        try:
            return ProfileLearning(**_json_loads(raw, {}))
        except ValueError:
            return None

    def _content_performance_rule_from_json(self, raw: str) -> Optional[ContentPerformanceRule]:
        try:
            return ContentPerformanceRule(**_json_loads(raw, {}))
        except ValueError:
            return None

    def _ensure_columns(
        self,
        connection: sqlite3.Connection,
        table_name: str,
        columns: Dict[str, str],
    ) -> None:
        existing = {
            row["name"]
            for row in connection.execute(f"PRAGMA table_info({table_name})").fetchall()
        }
        for column_name, definition in columns.items():
            if column_name in existing:
                continue
            connection.execute(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {definition}")

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
            contentProfileId=row["content_profile_id"] if "content_profile_id" in row.keys() else None,
            targetPlatform=row["target_platform"] if "target_platform" in row.keys() else None,
            contentGoal=row["content_goal"] if "content_goal" in row.keys() else "",
            videoType=row["video_type"] if "video_type" in row.keys() else "",
            plannedTitle=row["planned_title"] if "planned_title" in row.keys() else "",
            plannedDescription=row["planned_description"] if "planned_description" in row.keys() else "",
            scriptId=row["script_id"] if "script_id" in row.keys() else None,
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
