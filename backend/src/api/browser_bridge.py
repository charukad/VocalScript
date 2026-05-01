import logging
import json

from fastapi import APIRouter, File, Form, HTTPException, Query, UploadFile, WebSocket, WebSocketDisconnect, status
from fastapi.responses import FileResponse

from backend.src.domain.models.generation import (
    BridgeDebugEventListResponse,
    BridgeScreenshotUploadResponse,
    BridgeStatusResponse,
    BridgeWorkerCleanupResponse,
    BridgeWorkerDebugEventMessage,
    BridgeWorkerHeartbeat,
    BridgeWorkerHealthResult,
    BridgeWorkerRegistration,
)
from backend.src.domain.services.browser_bridge_service import (
    MIN_EXTENSION_VERSION,
    SUPPORTED_BRIDGE_PROTOCOL_VERSION,
    BrowserBridgeService,
    utc_now_iso,
)

logger = logging.getLogger(__name__)


def build_browser_bridge_router(
    bridge_service: BrowserBridgeService,
    session_token: str,
) -> APIRouter:
    router = APIRouter(prefix="/api/browser-bridge", tags=["browser-bridge"])

    @router.get("/status", response_model=BridgeStatusResponse)
    async def get_bridge_status():
        return BridgeStatusResponse(workers=bridge_service.snapshots())

    @router.get("/workers", response_model=BridgeStatusResponse)
    async def list_bridge_workers():
        return BridgeStatusResponse(workers=bridge_service.snapshots())

    @router.post("/workers/{worker_id}/pause", response_model=BridgeStatusResponse)
    async def pause_bridge_worker(worker_id: str):
        worker = bridge_service.pause_worker(worker_id)
        if not worker:
            raise HTTPException(status_code=404, detail="Worker not found")
        return BridgeStatusResponse(workers=bridge_service.snapshots())

    @router.post("/workers/{worker_id}/resume", response_model=BridgeStatusResponse)
    async def resume_bridge_worker(worker_id: str):
        worker = bridge_service.resume_worker(worker_id)
        if not worker:
            raise HTTPException(status_code=404, detail="Worker not found")
        return BridgeStatusResponse(workers=bridge_service.snapshots())

    @router.post("/workers/{worker_id}/clear-error", response_model=BridgeStatusResponse)
    async def clear_bridge_worker_error(worker_id: str):
        worker = bridge_service.clear_worker_error(worker_id)
        if not worker:
            raise HTTPException(status_code=404, detail="Worker not found")
        return BridgeStatusResponse(workers=bridge_service.snapshots())

    @router.delete("/workers/disconnected", response_model=BridgeWorkerCleanupResponse)
    async def clear_disconnected_bridge_workers(
        older_than_seconds: int = Query(0, alias="olderThanSeconds", ge=0),
    ):
        cleared = bridge_service.cleanup_disconnected_workers(older_than_seconds)
        return BridgeWorkerCleanupResponse(cleared=cleared, workers=bridge_service.snapshots())

    @router.post("/workers/{worker_id}/health-check", response_model=BridgeStatusResponse)
    async def run_worker_health_check(worker_id: str):
        ok, message = await bridge_service.send_worker_command(worker_id, "health_check")
        if not ok:
            raise HTTPException(status_code=409 if message != "Worker not found" else 404, detail=message)
        bridge_service.record_debug_event(worker_id, "health_check_requested", message)
        return BridgeStatusResponse(workers=bridge_service.snapshots())

    @router.post("/workers/{worker_id}/adapter-test", response_model=BridgeStatusResponse)
    async def run_worker_adapter_test(worker_id: str):
        ok, message = await bridge_service.send_worker_command(worker_id, "adapter_test")
        if not ok:
            raise HTTPException(status_code=409 if message != "Worker not found" else 404, detail=message)
        bridge_service.record_debug_event(worker_id, "adapter_test_requested", message)
        return BridgeStatusResponse(workers=bridge_service.snapshots())

    @router.get("/debug/events", response_model=BridgeDebugEventListResponse)
    async def list_debug_events(
        worker_id: str = Query("", alias="workerId"),
        job_id: str = Query("", alias="jobId"),
        limit: int = Query(100, ge=1, le=500),
    ):
        return BridgeDebugEventListResponse(
            events=bridge_service.debug_events(
                worker_id=worker_id or None,
                job_id=job_id or None,
                limit=limit,
            )
        )

    @router.post("/debug/screenshots", response_model=BridgeScreenshotUploadResponse)
    async def upload_debug_screenshot(
        worker_id: str = Form(..., alias="workerId"),
        job_id: str = Form("", alias="jobId"),
        provider: str = Form("meta"),
        reason: str = Form("Failure screenshot captured"),
        metadata: str = Form("{}"),
        file: UploadFile = File(...),
    ):
        try:
            parsed_metadata = json.loads(metadata) if metadata else {}
        except json.JSONDecodeError:
            parsed_metadata = {}
        event, screenshot_url, local_path = bridge_service.store_screenshot(
            file=file.file,
            filename=file.filename or "screenshot.png",
            worker_id=worker_id,
            job_id=job_id or None,
            provider=provider if provider in ("meta", "grok") else None,
            reason=reason,
            metadata={key: str(value) for key, value in parsed_metadata.items()} if isinstance(parsed_metadata, dict) else {},
        )
        return BridgeScreenshotUploadResponse(event=event, screenshotUrl=screenshot_url, localPath=local_path)

    @router.get("/debug/screenshots/{filename}")
    async def get_debug_screenshot(filename: str):
        path = bridge_service.screenshot_dir / filename
        if not path.exists() or not path.is_file():
            raise HTTPException(status_code=404, detail="Screenshot not found")
        return FileResponse(path)

    @router.delete("/debug/screenshots")
    async def clear_debug_screenshots():
        return {"cleared": bridge_service.clear_screenshots()}

    @router.websocket("/ws")
    async def browser_bridge_ws(websocket: WebSocket, token: str = Query("")):
        if token != session_token:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return

        await websocket.accept()
        worker_id = ""
        await websocket.send_json({
            "type": "bridge.hello",
            "serverTime": utc_now_iso(),
        })

        try:
            while True:
                message = await websocket.receive_json()
                message_type = str(message.get("type", ""))

                if message_type == "worker.ready":
                    registration = BridgeWorkerRegistration(**message)
                    worker_id = registration.worker_id
                    bridge_service.register_worker(
                        websocket=websocket,
                        worker_id=registration.worker_id,
                        version=registration.version,
                        providers=registration.providers,
                        extension_version=registration.extension_version,
                        account_label=registration.account_label,
                        chrome_profile_label=registration.chrome_profile_label,
                        profile_email=registration.profile_email,
                        capabilities=registration.capabilities,
                        health=registration.health,
                        current_job_id=registration.current_job_id,
                        current_project_id=registration.current_project_id,
                        cooldown_until=registration.cooldown_until,
                        last_error=registration.last_error,
                    )
                    logger.info("Browser bridge worker connected: %s", registration.worker_id)
                    await websocket.send_json({
                        "type": "bridge.ready_ack",
                        "workerId": registration.worker_id,
                        "serverTime": utc_now_iso(),
                        "supportedProtocolVersion": SUPPORTED_BRIDGE_PROTOCOL_VERSION,
                        "minExtensionVersion": MIN_EXTENSION_VERSION,
                    })
                    continue

                if message_type == "worker.heartbeat":
                    heartbeat = BridgeWorkerHeartbeat(**message)
                    worker_id = heartbeat.worker_id or worker_id
                    if worker_id:
                        bridge_service.touch_worker(worker_id, heartbeat)
                    await websocket.send_json({
                        "type": "bridge.heartbeat_ack",
                        "workerId": worker_id,
                        "serverTime": utc_now_iso(),
                    })
                    continue

                if message_type == "worker.health_result":
                    result = BridgeWorkerHealthResult(**message)
                    bridge_service.update_worker_health(
                        result.worker_id,
                        health=result.health,
                        capabilities=result.capabilities,
                    )
                    await websocket.send_json({
                        "type": "bridge.health_ack",
                        "workerId": result.worker_id,
                        "serverTime": utc_now_iso(),
                    })
                    continue

                if message_type == "worker.debug_event":
                    event = BridgeWorkerDebugEventMessage(**message)
                    bridge_service.record_debug_event(
                        worker_id=event.worker_id,
                        job_id=event.job_id,
                        provider=event.provider,
                        level=event.level,
                        step=event.step,
                        message=event.message,
                        metadata=event.metadata,
                    )
                    await websocket.send_json({
                        "type": "bridge.debug_ack",
                        "workerId": event.worker_id,
                        "eventId": event.id,
                        "serverTime": utc_now_iso(),
                    })
                    continue

                await websocket.send_json({
                    "type": "bridge.message_ack",
                    "receivedType": message_type,
                    "serverTime": utc_now_iso(),
                })
        except WebSocketDisconnect:
            bridge_service.disconnect_worker(websocket)
            if worker_id:
                logger.info("Browser bridge worker disconnected: %s", worker_id)
        except Exception as exc:
            bridge_service.disconnect_worker(websocket)
            logger.exception("Browser bridge websocket failed")
            await _close_with_error(websocket, str(exc))

    return router


async def _close_with_error(websocket: WebSocket, error: str) -> None:
    try:
        await websocket.send_json({"type": "bridge.error", "error": error})
        await websocket.close(code=status.WS_1011_INTERNAL_ERROR)
    except Exception:
        pass
