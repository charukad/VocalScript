from typing import Any, Dict, List, Literal, Optional

from pydantic import Field

from backend.src.domain.models.generation import ApiModel


AgentRunStatus = Literal["pending", "running", "completed", "failed"]
WorkflowRunStatus = Literal["pending", "running", "completed", "failed"]
WorkflowType = Literal["content_draft", "analytics_learning"]


class AgentWorkflowStartRequest(ApiModel):
    profile_id: str = Field(alias="profileId")
    project_id: Optional[str] = Field(default=None, alias="projectId")
    workflow_type: WorkflowType = Field(default="content_draft", alias="workflowType")
    seed_prompt: str = Field(default="", alias="seedPrompt")
    create_drafts: bool = Field(default=True, alias="createDrafts")


class WorkflowRun(ApiModel):
    id: str
    profile_id: str = Field(alias="profileId")
    project_id: Optional[str] = Field(default=None, alias="projectId")
    workflow_type: WorkflowType = Field(alias="workflowType")
    input_json: Dict[str, Any] = Field(default_factory=dict, alias="inputJson")
    output_json: Dict[str, Any] = Field(default_factory=dict, alias="outputJson")
    status: WorkflowRunStatus = "pending"
    error_message: Optional[str] = Field(default=None, alias="errorMessage")
    created_at: str = Field(alias="createdAt")
    updated_at: str = Field(alias="updatedAt")


class AgentRun(ApiModel):
    id: str
    workflow_run_id: str = Field(alias="workflowRunId")
    profile_id: str = Field(alias="profileId")
    project_id: Optional[str] = Field(default=None, alias="projectId")
    agent_name: str = Field(alias="agentName")
    input_json: Dict[str, Any] = Field(default_factory=dict, alias="inputJson")
    output_json: Dict[str, Any] = Field(default_factory=dict, alias="outputJson")
    status: AgentRunStatus = "pending"
    error_message: Optional[str] = Field(default=None, alias="errorMessage")
    created_at: str = Field(alias="createdAt")
    updated_at: str = Field(alias="updatedAt")


class WorkflowRunDetail(WorkflowRun):
    runs: List[AgentRun] = Field(default_factory=list)


class AgentRunListResponse(ApiModel):
    runs: List[AgentRun]
