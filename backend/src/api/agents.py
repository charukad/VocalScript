from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from backend.src.agents.orchestrator import AgentOrchestrator
from backend.src.domain.models.agent import (
    AgentRun,
    AgentRunListResponse,
    AgentWorkflowStartRequest,
    WorkflowRunDetail,
)


def build_agents_router(agent_orchestrator: AgentOrchestrator) -> APIRouter:
    router = APIRouter(prefix="/api/agents", tags=["agents"])

    @router.post("/workflows/start", response_model=WorkflowRunDetail)
    async def start_workflow(request: AgentWorkflowStartRequest):
        workflow = agent_orchestrator.start_workflow(request)
        if not workflow:
            raise HTTPException(status_code=404, detail="Content profile not found")
        return workflow

    @router.get("/workflows/{workflow_id}", response_model=WorkflowRunDetail)
    async def get_workflow(workflow_id: str):
        workflow = agent_orchestrator.get_workflow(workflow_id)
        if not workflow:
            raise HTTPException(status_code=404, detail="Workflow not found")
        return workflow

    @router.get("/runs", response_model=AgentRunListResponse)
    async def list_agent_runs(
        profile_id: Optional[str] = Query(default=None, alias="profileId"),
    ):
        return AgentRunListResponse(runs=agent_orchestrator.list_agent_runs(profile_id=profile_id))

    @router.get("/runs/{run_id}", response_model=AgentRun)
    async def get_agent_run(run_id: str):
        run = agent_orchestrator.get_agent_run(run_id)
        if not run:
            raise HTTPException(status_code=404, detail="Agent run not found")
        return run

    return router
