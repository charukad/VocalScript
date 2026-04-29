from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Dict, List

from fastapi import WebSocket

from backend.src.domain.models.generation import BridgeWorkerSnapshot, ProviderName


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass
class ConnectedWorker:
    worker_id: str
    version: str
    providers: List[ProviderName]
    websocket: WebSocket
    connected_at: str = field(default_factory=utc_now_iso)
    last_seen_at: str = field(default_factory=utc_now_iso)


class BrowserBridgeService:
    def __init__(self):
        self._workers: Dict[str, ConnectedWorker] = {}

    def register_worker(
        self,
        websocket: WebSocket,
        worker_id: str,
        version: str,
        providers: List[ProviderName],
    ) -> ConnectedWorker:
        worker = ConnectedWorker(
            worker_id=worker_id,
            version=version,
            providers=providers,
            websocket=websocket,
        )
        self._workers[worker_id] = worker
        return worker

    def touch_worker(self, worker_id: str) -> None:
        worker = self._workers.get(worker_id)
        if worker:
            worker.last_seen_at = utc_now_iso()

    def disconnect_worker(self, websocket: WebSocket) -> None:
        disconnected_ids = [
            worker_id
            for worker_id, worker in self._workers.items()
            if worker.websocket is websocket
        ]
        for worker_id in disconnected_ids:
            self._workers.pop(worker_id, None)

    def snapshots(self) -> List[BridgeWorkerSnapshot]:
        return [
            BridgeWorkerSnapshot(
                workerId=worker.worker_id,
                version=worker.version,
                providers=worker.providers,
                status="connected",
                connectedAt=worker.connected_at,
                lastSeenAt=worker.last_seen_at,
            )
            for worker in self._workers.values()
        ]
