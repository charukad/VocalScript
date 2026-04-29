import logging

from fastapi import APIRouter, HTTPException, Query, WebSocket, WebSocketDisconnect, status

from backend.src.domain.models.generation import (
    BridgeStatusResponse,
    BridgeWorkerRegistration,
)
from backend.src.domain.services.browser_bridge_service import BrowserBridgeService, utc_now_iso

logger = logging.getLogger(__name__)


def build_browser_bridge_router(
    bridge_service: BrowserBridgeService,
    session_token: str,
) -> APIRouter:
    router = APIRouter(prefix="/api/browser-bridge", tags=["browser-bridge"])

    @router.get("/status", response_model=BridgeStatusResponse)
    async def get_bridge_status():
        return BridgeStatusResponse(workers=bridge_service.snapshots())

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
                    )
                    logger.info("Browser bridge worker connected: %s", registration.worker_id)
                    await websocket.send_json({
                        "type": "bridge.ready_ack",
                        "workerId": registration.worker_id,
                        "serverTime": utc_now_iso(),
                    })
                    continue

                if message_type == "worker.heartbeat":
                    worker_id = str(message.get("workerId") or worker_id)
                    if worker_id:
                        bridge_service.touch_worker(worker_id)
                    await websocket.send_json({
                        "type": "bridge.heartbeat_ack",
                        "workerId": worker_id,
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
