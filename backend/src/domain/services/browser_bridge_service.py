import json
import shutil
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import BinaryIO, Dict, List, Optional

from fastapi import WebSocket

from backend.src.domain.models.generation import (
    BridgeConnectionStatus,
    BridgeAdapterTestRecord,
    BridgeDebugEvent,
    BridgeWorkerHeartbeat,
    BridgeWorkerSnapshot,
    ProviderCapability,
    ProviderHealthSnapshot,
    ProviderName,
)


SUPPORTED_BRIDGE_PROTOCOL_VERSION = "0.1.0"
MIN_EXTENSION_VERSION = "0.1.0"
STALE_WORKER_AFTER_SECONDS = 30


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass
class ConnectedWorker:
    worker_id: str
    version: str
    providers: List[ProviderName]
    websocket: Optional[WebSocket]
    extension_version: str = ""
    account_label: str = ""
    chrome_profile_label: str = ""
    profile_email: str = ""
    current_job_id: Optional[str] = None
    current_project_id: Optional[str] = None
    job_message: str = ""
    cooldown_until: Optional[str] = None
    last_error: Optional[str] = None
    paused: bool = False
    nickname: str = ""
    capabilities: List[ProviderCapability] = field(default_factory=list)
    health: List[ProviderHealthSnapshot] = field(default_factory=list)
    connected_at: str = field(default_factory=utc_now_iso)
    last_seen_at: str = field(default_factory=utc_now_iso)
    disconnected_at: Optional[str] = None


class BrowserBridgeService:
    def __init__(self, debug_dir: str = "backend/output/browser_bridge_debug"):
        self._workers: Dict[str, ConnectedWorker] = {}
        self._debug_events: List[BridgeDebugEvent] = []
        self._adapter_tests: List[BridgeAdapterTestRecord] = []
        self.debug_dir = Path(debug_dir)
        self.screenshot_dir = self.debug_dir / "screenshots"
        self.job_record_dir = self.debug_dir / "jobs"
        self.adapter_media_dir = self.debug_dir / "adapter_test_media"
        self.screenshot_dir.mkdir(parents=True, exist_ok=True)
        self.job_record_dir.mkdir(parents=True, exist_ok=True)
        self.adapter_media_dir.mkdir(parents=True, exist_ok=True)
        self._debug_events = self._load_debug_events()
        self._adapter_tests = self._load_adapter_tests()

    def register_worker(
        self,
        websocket: WebSocket,
        worker_id: str,
        version: str,
        providers: List[ProviderName],
        extension_version: Optional[str] = None,
        account_label: Optional[str] = None,
        chrome_profile_label: Optional[str] = None,
        profile_email: Optional[str] = None,
        capabilities: Optional[List[ProviderCapability]] = None,
        health: Optional[List[ProviderHealthSnapshot]] = None,
        current_job_id: Optional[str] = None,
        current_project_id: Optional[str] = None,
        cooldown_until: Optional[str] = None,
        last_error: Optional[str] = None,
    ) -> ConnectedWorker:
        existing = self._workers.get(worker_id)
        worker = existing or ConnectedWorker(
            worker_id=worker_id,
            version=version,
            providers=providers,
            websocket=websocket,
        )
        worker.websocket = websocket
        worker.version = version
        worker.providers = providers
        worker.extension_version = extension_version or worker.extension_version or version
        worker.account_label = account_label or worker.account_label
        worker.chrome_profile_label = chrome_profile_label or worker.chrome_profile_label
        worker.profile_email = profile_email or worker.profile_email
        worker.capabilities = capabilities or worker.capabilities
        worker.health = health or worker.health
        worker.current_job_id = current_job_id
        worker.current_project_id = current_project_id
        worker.cooldown_until = cooldown_until
        worker.last_error = last_error
        worker.disconnected_at = None
        worker.last_seen_at = utc_now_iso()
        if not existing:
            worker.connected_at = worker.last_seen_at
        self._workers[worker_id] = worker
        return worker

    def touch_worker(self, worker_id: str, heartbeat: Optional[BridgeWorkerHeartbeat] = None) -> None:
        worker = self._workers.get(worker_id)
        if worker:
            worker.last_seen_at = utc_now_iso()
            worker.disconnected_at = None
            if heartbeat:
                self._apply_heartbeat(worker, heartbeat)

    def disconnect_worker(self, websocket: WebSocket) -> None:
        for worker in self._workers.values():
            if worker.websocket is websocket:
                worker.websocket = None
                worker.disconnected_at = utc_now_iso()
                worker.current_job_id = None
                worker.current_project_id = None
                worker.job_message = "Extension disconnected"

    def snapshots(self) -> List[BridgeWorkerSnapshot]:
        return [
            BridgeWorkerSnapshot(
                workerId=worker.worker_id,
                version=worker.version,
                extensionVersion=worker.extension_version,
                providers=worker.providers,
                status=self._worker_status(worker),
                paused=worker.paused,
                nickname=worker.nickname,
                accountLabel=worker.account_label,
                chromeProfileLabel=worker.chrome_profile_label,
                profileEmail=worker.profile_email,
                currentJobId=worker.current_job_id,
                currentProjectId=worker.current_project_id,
                jobMessage=worker.job_message,
                cooldownUntil=worker.cooldown_until,
                lastError=worker.last_error,
                capabilities=worker.capabilities,
                health=worker.health,
                connectedAt=worker.connected_at,
                lastSeenAt=worker.last_seen_at,
                disconnectedAt=worker.disconnected_at,
                compatibility=self._compatibility(worker),
            )
            for worker in self._workers.values()
        ]

    async def send_worker_command(self, worker_id: str, command: str, payload: Optional[Dict[str, str]] = None) -> tuple[bool, str]:
        worker = self._workers.get(worker_id)
        if not worker:
            return False, "Worker not found"
        if worker.websocket is None:
            return False, "Worker is disconnected"
        if self._is_stale(worker):
            return False, "Worker is stale"
        await worker.websocket.send_json({
            "type": "bridge.command",
            "workerId": worker_id,
            "command": command,
            "payload": payload or {},
            "commandId": f"cmd-{uuid.uuid4().hex[:12]}",
            "serverTime": utc_now_iso(),
        })
        worker.job_message = f"Command sent: {command}"
        return True, "Command sent"

    def update_worker_health(
        self,
        worker_id: str,
        health: List[ProviderHealthSnapshot],
        capabilities: Optional[List[ProviderCapability]] = None,
    ) -> None:
        worker = self._workers.get(worker_id)
        if not worker:
            return
        worker.health = health
        if capabilities:
            worker.capabilities = capabilities
        worker.last_seen_at = utc_now_iso()
        worker.job_message = "Health check updated"

    def record_debug_event(
        self,
        worker_id: str,
        step: str,
        message: str,
        job_id: Optional[str] = None,
        provider: Optional[ProviderName] = None,
        level: str = "info",
        metadata: Optional[Dict[str, str]] = None,
    ) -> BridgeDebugEvent:
        event = BridgeDebugEvent(
            id=f"debug-{uuid.uuid4().hex[:12]}",
            workerId=worker_id,
            jobId=job_id,
            provider=provider,
            level=level if level in ("debug", "info", "warning", "error") else "info",
            step=step,
            message=message,
            createdAt=utc_now_iso(),
            metadata=metadata or {},
        )
        self._debug_events.append(event)
        self._debug_events = self._debug_events[-500:]
        self._save_debug_events()
        if job_id:
            self._persist_job_record(job_id)
        worker = self._workers.get(worker_id)
        if worker:
            worker.job_message = message
            worker.last_seen_at = utc_now_iso()
            if level == "error":
                worker.last_error = message
        return event

    def record_adapter_test_request(
        self,
        worker_id: str,
        provider: ProviderName,
        mode: str,
        prompt: str = "",
        metadata: Optional[Dict[str, str]] = None,
    ) -> BridgeAdapterTestRecord:
        record = BridgeAdapterTestRecord(
            id=f"adapter-{uuid.uuid4().hex[:12]}",
            workerId=worker_id,
            provider=provider,
            mode=mode,
            status="requested",
            prompt=prompt[:500],
            message="Adapter test requested",
            createdAt=utc_now_iso(),
            metadata=metadata or {},
        )
        self._adapter_tests.append(record)
        self._adapter_tests = self._adapter_tests[-200:]
        self._save_adapter_tests()
        return record

    def complete_adapter_test(
        self,
        worker_id: str,
        provider: ProviderName,
        status: str,
        message: str,
        result_url: Optional[str] = None,
        metadata: Optional[Dict[str, str]] = None,
    ) -> None:
        record = next(
            (
                item
                for item in reversed(self._adapter_tests)
                if item.worker_id == worker_id and item.provider == provider and item.status == "requested"
            ),
            None,
        )
        if not record:
            record = self.record_adapter_test_request(worker_id, provider, "safe")
        merged_metadata = dict(record.metadata)
        if metadata:
            merged_metadata.update(metadata)
        completed = record.model_copy(
            update={
                "status": status,
                "message": message,
                "result_url": result_url,
                "completed_at": utc_now_iso(),
                "metadata": merged_metadata,
            }
        )
        self._adapter_tests = [
            completed if item.id == record.id else item
            for item in self._adapter_tests
        ][-200:]
        self._save_adapter_tests()

    def adapter_tests(self, worker_id: Optional[str] = None, limit: int = 100) -> List[BridgeAdapterTestRecord]:
        tests = self._adapter_tests
        if worker_id:
            tests = [item for item in tests if item.worker_id == worker_id]
        return tests[-max(1, min(limit, 200)):]

    def store_adapter_test_media(
        self,
        test_id: str,
        files: List[tuple[str, BinaryIO]],
    ) -> tuple[str, List[str]]:
        safe_test = test_id.replace("/", "_")
        urls: List[str] = []
        for index, (filename, file) in enumerate(files, 1):
            suffix = Path(filename or f"variant-{index}.png").suffix or ".png"
            local_path = self.adapter_media_dir / f"{safe_test}-{index}-{uuid.uuid4().hex[:8]}{suffix}"
            with local_path.open("wb") as output:
                shutil.copyfileobj(file, output)
            urls.append(f"/api/browser-bridge/adapter-tests/media/{local_path.name}")
        if urls:
            self._attach_adapter_test_media(test_id, urls[0], {"adapterMediaCount": str(len(urls))})
        return (urls[0] if urls else ""), urls

    def _attach_adapter_test_media(self, test_id: str, result_url: str, metadata: Dict[str, str]) -> None:
        for index, record in enumerate(self._adapter_tests):
            if record.id != test_id:
                continue
            merged_metadata = dict(record.metadata)
            merged_metadata.update(metadata)
            self._adapter_tests[index] = record.model_copy(
                update={
                    "result_url": result_url,
                    "metadata": merged_metadata,
                }
            )
            self._save_adapter_tests()
            break

    def debug_events(
        self,
        worker_id: Optional[str] = None,
        job_id: Optional[str] = None,
        limit: int = 100,
    ) -> List[BridgeDebugEvent]:
        events = self._debug_events
        if worker_id:
            events = [event for event in events if event.worker_id == worker_id]
        if job_id:
            events = [event for event in events if event.job_id == job_id]
        return events[-max(1, min(limit, 500)):]

    def store_screenshot(
        self,
        file: BinaryIO,
        filename: str,
        worker_id: str,
        job_id: Optional[str],
        provider: Optional[ProviderName],
        reason: str,
        metadata: Optional[Dict[str, str]] = None,
    ) -> tuple[BridgeDebugEvent, str, str]:
        safe_job = (job_id or "no-job").replace("/", "_")
        suffix = Path(filename or "screenshot.png").suffix or ".png"
        local_path = self.screenshot_dir / f"{safe_job}-{uuid.uuid4().hex[:8]}{suffix}"
        with local_path.open("wb") as output:
            shutil.copyfileobj(file, output)
        screenshot_url = f"/api/browser-bridge/debug/screenshots/{local_path.name}"
        event = self.record_debug_event(
            worker_id=worker_id,
            job_id=job_id,
            provider=provider,
            level="error",
            step="failure_screenshot",
            message=reason or "Failure screenshot captured",
            metadata={
                **(metadata or {}),
                "screenshotUrl": screenshot_url,
                "localPath": str(local_path),
            },
        )
        return event, screenshot_url, str(local_path)

    def clear_screenshots(self) -> int:
        if not self.screenshot_dir.exists():
            return 0
        cleared = 0
        for path in self.screenshot_dir.iterdir():
            if not path.is_file():
                continue
            try:
                path.unlink()
                cleared += 1
            except OSError:
                continue
        self.record_debug_event(
            worker_id="system",
            step="debug_screenshots_cleared",
            message=f"Cleared {cleared} debug screenshot file{'s' if cleared != 1 else ''}",
            level="info",
        )
        return cleared

    def pause_worker(self, worker_id: str) -> Optional[ConnectedWorker]:
        worker = self._workers.get(worker_id)
        if not worker:
            return None
        worker.paused = True
        worker.job_message = "Paused from Bridge Monitor"
        return worker

    def resume_worker(self, worker_id: str) -> Optional[ConnectedWorker]:
        worker = self._workers.get(worker_id)
        if not worker:
            return None
        worker.paused = False
        if worker.job_message == "Paused from Bridge Monitor":
            worker.job_message = "Ready"
        return worker

    def clear_worker_error(self, worker_id: str) -> Optional[ConnectedWorker]:
        worker = self._workers.get(worker_id)
        if not worker:
            return None
        worker.last_error = None
        if self._worker_status(worker) == "failed":
            worker.job_message = "Error cleared"
        return worker

    def update_worker_nickname(self, worker_id: str, nickname: str) -> Optional[ConnectedWorker]:
        worker = self._workers.get(worker_id)
        if not worker:
            return None
        worker.nickname = nickname.strip()[:80]
        worker.job_message = "Nickname updated"
        return worker

    def cleanup_disconnected_workers(self, older_than_seconds: int = 0) -> int:
        now = datetime.now(timezone.utc)
        remove_ids: list[str] = []
        for worker_id, worker in self._workers.items():
            if worker.websocket is not None:
                continue
            disconnected_at = _parse_iso(worker.disconnected_at)
            if not disconnected_at:
                remove_ids.append(worker_id)
                continue
            if now - disconnected_at >= timedelta(seconds=max(0, older_than_seconds)):
                remove_ids.append(worker_id)
        for worker_id in remove_ids:
            self._workers.pop(worker_id, None)
        return len(remove_ids)

    def can_worker_claim(self, worker_id: Optional[str], provider: Optional[ProviderName] = None) -> tuple[bool, str]:
        if not worker_id:
            return True, ""
        worker = self._workers.get(worker_id)
        if not worker:
            return True, ""
        status = self._worker_status(worker)
        if worker.paused:
            return False, "Worker is paused in Bridge Monitor."
        if status in ("disconnected", "stale", "version_mismatch"):
            return False, f"Worker cannot claim jobs while {status.replace('_', ' ')}."
        if status == "cooldown":
            return False, "Worker is cooling down before the next provider request."
        if worker.current_job_id:
            return False, f"Worker is already running {worker.current_job_id}."
        if provider:
            health = next((item for item in worker.health if item.provider == provider), None)
            if health and health.status in ("needs_login", "manual_action_required", "blocked", "error"):
                return False, f"Worker provider health is {health.status.replace('_', ' ')}."
        return True, ""

    def _apply_heartbeat(self, worker: ConnectedWorker, heartbeat: BridgeWorkerHeartbeat) -> None:
        if heartbeat.providers:
            worker.providers = heartbeat.providers
        if heartbeat.account_label is not None:
            worker.account_label = heartbeat.account_label
        if heartbeat.chrome_profile_label is not None:
            worker.chrome_profile_label = heartbeat.chrome_profile_label
        if heartbeat.profile_email is not None:
            worker.profile_email = heartbeat.profile_email
        if heartbeat.capabilities:
            worker.capabilities = heartbeat.capabilities
        if heartbeat.health:
            worker.health = heartbeat.health
        worker.current_job_id = heartbeat.current_job_id
        worker.current_project_id = heartbeat.current_project_id
        worker.job_message = heartbeat.job_message or worker.job_message
        worker.cooldown_until = heartbeat.cooldown_until
        worker.last_error = heartbeat.last_error

    def _worker_status(self, worker: ConnectedWorker) -> BridgeConnectionStatus:
        if worker.websocket is None:
            return "disconnected"
        if self._is_version_mismatch(worker):
            return "version_mismatch"
        if self._is_stale(worker):
            return "stale"
        if worker.current_job_id:
            return "working"
        if worker.paused:
            return "paused"
        if self._is_cooling_down(worker):
            return "cooldown"
        if worker.last_error:
            return "failed"
        return "connected"

    def _is_stale(self, worker: ConnectedWorker) -> bool:
        last_seen = _parse_iso(worker.last_seen_at)
        if not last_seen:
            return False
        return datetime.now(timezone.utc) - last_seen > timedelta(seconds=STALE_WORKER_AFTER_SECONDS)

    def _is_cooling_down(self, worker: ConnectedWorker) -> bool:
        cooldown_until = _parse_iso(worker.cooldown_until)
        if not cooldown_until:
            return False
        return cooldown_until > datetime.now(timezone.utc)

    def _is_version_mismatch(self, worker: ConnectedWorker) -> bool:
        return worker.version != SUPPORTED_BRIDGE_PROTOCOL_VERSION

    def _compatibility(self, worker: ConnectedWorker) -> Dict[str, str]:
        return {
            "supportedProtocolVersion": SUPPORTED_BRIDGE_PROTOCOL_VERSION,
            "minExtensionVersion": MIN_EXTENSION_VERSION,
            "status": "version_mismatch" if self._is_version_mismatch(worker) else "ok",
        }

    def _debug_events_path(self) -> Path:
        return self.debug_dir / "debug_events.json"

    def _adapter_tests_path(self) -> Path:
        return self.debug_dir / "adapter_tests.json"

    def _load_debug_events(self) -> List[BridgeDebugEvent]:
        path = self._debug_events_path()
        if not path.exists():
            return []
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return []
        events: List[BridgeDebugEvent] = []
        for item in raw[-500:] if isinstance(raw, list) else []:
            try:
                events.append(BridgeDebugEvent(**item))
            except ValueError:
                continue
        return events

    def _save_debug_events(self) -> None:
        self.debug_dir.mkdir(parents=True, exist_ok=True)
        payload = [event.model_dump(by_alias=True) for event in self._debug_events[-500:]]
        tmp_path = self._debug_events_path().with_suffix(".tmp")
        tmp_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        tmp_path.replace(self._debug_events_path())

    def _load_adapter_tests(self) -> List[BridgeAdapterTestRecord]:
        path = self._adapter_tests_path()
        if not path.exists():
            return []
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return []
        tests: List[BridgeAdapterTestRecord] = []
        for item in raw[-200:] if isinstance(raw, list) else []:
            try:
                tests.append(BridgeAdapterTestRecord(**item))
            except ValueError:
                continue
        return tests

    def _save_adapter_tests(self) -> None:
        self.debug_dir.mkdir(parents=True, exist_ok=True)
        payload = [record.model_dump(by_alias=True) for record in self._adapter_tests[-200:]]
        tmp_path = self._adapter_tests_path().with_suffix(".tmp")
        tmp_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        tmp_path.replace(self._adapter_tests_path())

    def _persist_job_record(self, job_id: str) -> None:
        safe_job = job_id.replace("/", "_")
        events = [
            event.model_dump(by_alias=True)
            for event in self._debug_events
            if event.job_id == job_id
        ]
        if not events:
            return
        payload = {
            "jobId": job_id,
            "updatedAt": utc_now_iso(),
            "events": events,
        }
        tmp_path = (self.job_record_dir / f"{safe_job}.json").with_suffix(".tmp")
        tmp_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        tmp_path.replace(self.job_record_dir / f"{safe_job}.json")


def _parse_iso(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed
