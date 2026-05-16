import uuid
from typing import Any, Dict, List, Optional

from backend.src.agents.base_agent import BaseAgent
from backend.src.agents.analytics_agent import AnalyticsAgent
from backend.src.agents.idea_agent import IdeaAgent
from backend.src.agents.learning_agent import LearningAgent
from backend.src.agents.profile_strategy_agent import ProfileStrategyAgent
from backend.src.agents.script_agent import ScriptAgent
from backend.src.agents.storyboard_agent import StoryboardAgent
from backend.src.agents.timeline_agent import TimelineAgent
from backend.src.domain.models.agent import (
    AgentRun,
    AgentWorkflowStartRequest,
    WorkflowRun,
    WorkflowRunDetail,
)
from backend.src.domain.models.content_studio import (
    ContentIdeaCreateRequest,
    ScriptCreateRequest,
)
from backend.src.domain.models.project import utc_now_iso
from backend.src.domain.models.viral import IdeaScoreRequest, ScriptAnalysisRequest
from backend.src.domain.services.content_profile_service import ContentProfileService
from backend.src.domain.services.content_studio_service import ContentStudioService
from backend.src.domain.services.analytics_service import AnalyticsService
from backend.src.domain.services.sqlite_store import SQLiteStore
from backend.src.domain.services.storyboard_service import StoryboardService
from backend.src.domain.services.viral_scoring_service import ViralScoringService


class AgentOrchestrator:
    def __init__(
        self,
        store: SQLiteStore,
        content_profile_service: ContentProfileService,
        content_studio_service: ContentStudioService,
        analytics_service: AnalyticsService,
        storyboard_service: StoryboardService,
        viral_scoring_service: ViralScoringService,
    ):
        self.store = store
        self.content_profile_service = content_profile_service
        self.content_studio_service = content_studio_service
        self.analytics_service = analytics_service
        self.viral_scoring_service = viral_scoring_service
        self.content_draft_agents: List[BaseAgent] = [
            ProfileStrategyAgent(),
            IdeaAgent(),
            ScriptAgent(),
            StoryboardAgent(storyboard_service),
            TimelineAgent(),
        ]
        self.analytics_learning_agents: List[BaseAgent] = [
            AnalyticsAgent(),
            LearningAgent(),
        ]

    def start_workflow(self, request: AgentWorkflowStartRequest) -> Optional[WorkflowRunDetail]:
        profile = self.content_profile_service.get_profile(request.profile_id)
        if not profile or profile.is_archived:
            return None

        now = utc_now_iso()
        workflow = WorkflowRun(
            id=f"workflow-{uuid.uuid4().hex[:12]}",
            profileId=profile.id,
            projectId=request.project_id,
            workflowType=request.workflow_type,
            inputJson=request.model_dump(by_alias=True),
            outputJson={},
            status="running",
            createdAt=now,
            updatedAt=now,
        )
        self.store.upsert_workflow_run(workflow)

        state: Dict[str, Any] = {
            "profile": profile.model_dump(by_alias=True),
            "seedPrompt": request.seed_prompt,
            "profileRules": [
                rule.model_dump(by_alias=True)
                for rule in self.analytics_service.list_profile_rules(profile.id)
            ],
        }
        agents = self._agents_for_workflow(request.workflow_type)
        if request.workflow_type == "analytics_learning":
            state["performance"] = [
                performance.model_dump(by_alias=True)
                for performance in self.analytics_service.list_performance(profile.id)
            ]
        created_idea_ids: List[str] = []
        created_script_id: Optional[str] = None
        runs: List[AgentRun] = []

        try:
            for agent in agents:
                run = self._start_agent_run(workflow, agent, state)
                runs.append(run)
                output = agent.run(state)
                output = self._enrich_output(agent.name, output)
                state.update(output)
                run = run.model_copy(
                    update={
                        "output_json": output,
                        "status": "completed",
                        "updated_at": utc_now_iso(),
                    }
                )
                self.store.upsert_agent_run(run)
                runs[-1] = run

                if agent.name == "idea_agent" and request.create_drafts:
                    created_idea_ids = self._create_draft_ideas(profile.id, output["ideas"])
                    state["createdIdeaIds"] = created_idea_ids
                if agent.name == "script_agent" and request.create_drafts:
                    created_script_id = self._create_draft_script(profile.id, output["script"], created_idea_ids)
                    state["createdScriptId"] = created_script_id
                if agent.name == "learning_agent":
                    learnings = self.analytics_service.replace_learning_bundle(
                        profile.id,
                        output.get("learnings", []),
                        output.get("rules", []),
                    )
                    state["storedLearnings"] = [
                        learning.model_dump(by_alias=True)
                        for learning in learnings
                    ]

            workflow = workflow.model_copy(
                update={
                    "output_json": {
                    **(
                        {
                            "strategy": state.get("strategy"),
                            "ideas": state.get("ideas", []),
                            "script": state.get("script"),
                            "storyboard": state.get("storyboard"),
                            "timelineDraft": state.get("timelineDraft"),
                            "createdIdeaIds": created_idea_ids,
                            "createdScriptId": created_script_id,
                        }
                        if request.workflow_type == "content_draft"
                        else {
                            "performanceSummary": state.get("performanceSummary"),
                            "learnings": state.get("storedLearnings", []),
                        }
                    ),
                    },
                    "status": "completed",
                    "updated_at": utc_now_iso(),
                }
            )
            self.store.upsert_workflow_run(workflow)
            return WorkflowRunDetail(**workflow.model_dump(by_alias=True), runs=runs)
        except Exception as exc:
            if runs:
                failed_run = runs[-1].model_copy(
                    update={
                        "status": "failed",
                        "error_message": str(exc),
                        "updated_at": utc_now_iso(),
                    }
                )
                self.store.upsert_agent_run(failed_run)
                runs[-1] = failed_run
            workflow = workflow.model_copy(
                update={
                    "status": "failed",
                    "error_message": str(exc),
                    "updated_at": utc_now_iso(),
                }
            )
            self.store.upsert_workflow_run(workflow)
            return WorkflowRunDetail(**workflow.model_dump(by_alias=True), runs=runs)

    def get_workflow(self, workflow_id: str) -> Optional[WorkflowRunDetail]:
        workflow = self.store.get_workflow_run(workflow_id)
        if not workflow:
            return None
        return WorkflowRunDetail(
            **workflow.model_dump(by_alias=True),
            runs=self.store.list_agent_runs(workflow_run_id=workflow_id),
        )

    def list_agent_runs(self, profile_id: Optional[str] = None) -> List[AgentRun]:
        return self.store.list_agent_runs(profile_id=profile_id)

    def get_agent_run(self, run_id: str) -> Optional[AgentRun]:
        return self.store.get_agent_run(run_id)

    def _start_agent_run(
        self,
        workflow: WorkflowRun,
        agent: BaseAgent,
        state: Dict[str, Any],
    ) -> AgentRun:
        now = utc_now_iso()
        run = AgentRun(
            id=f"agent-run-{uuid.uuid4().hex[:12]}",
            workflowRunId=workflow.id,
            profileId=workflow.profile_id,
            projectId=workflow.project_id,
            agentName=agent.name,
            inputJson=self._agent_input_snapshot(agent.name, state),
            outputJson={},
            status="running",
            createdAt=now,
            updatedAt=now,
        )
        self.store.upsert_agent_run(run)
        return run

    def _enrich_output(self, agent_name: str, output: Dict[str, Any]) -> Dict[str, Any]:
        if agent_name == "idea_agent":
            ideas = []
            for idea in output["ideas"]:
                score = self.viral_scoring_service.score_idea(
                    IdeaScoreRequest(
                        title=idea["title"],
                        hook=idea["hook"],
                        topic=idea["topic"],
                        platform=idea["platform"],
                    )
                )
                ideas.append({**idea, "estimatedViralScore": score.total})
            return {"ideas": ideas}
        if agent_name == "script_agent":
            script = output["script"]
            analysis = self.viral_scoring_service.analyze_script(
                ScriptAnalysisRequest(
                    script=script["content"],
                    platform=script["platform"],
                    targetDurationSeconds=script["targetDurationSeconds"],
                )
            )
            return {"script": {**script, "analysis": analysis.model_dump(by_alias=True)}}
        return output

    def _create_draft_ideas(self, profile_id: str, ideas: List[Dict[str, Any]]) -> List[str]:
        created_ids: List[str] = []
        for idea in ideas:
            created = self.content_studio_service.create_idea(
                profile_id,
                ContentIdeaCreateRequest(**idea),
            )
            created_ids.append(created.id)
        return created_ids

    def _create_draft_script(
        self,
        profile_id: str,
        script: Dict[str, Any],
        created_idea_ids: List[str],
    ) -> str:
        created = self.content_studio_service.create_script(
            profile_id,
            ScriptCreateRequest(
                title=script["title"],
                content=script["content"],
                ideaId=created_idea_ids[0] if created_idea_ids else None,
            ),
        )
        self.content_studio_service.update_script(
            created.id,
            request=self._analysis_update_request(script),
        )
        return created.id

    def _analysis_update_request(self, script: Dict[str, Any]):
        from backend.src.domain.models.content_studio import ScriptUpdateRequest

        return ScriptUpdateRequest(latestAnalysis=script.get("analysis"))

    def _agent_input_snapshot(self, agent_name: str, state: Dict[str, Any]) -> Dict[str, Any]:
        keys_by_agent = {
            "profile_strategy_agent": ("profile", "seedPrompt", "profileRules"),
            "idea_agent": ("profile", "strategy"),
            "script_agent": ("profile", "strategy", "ideas"),
            "storyboard_agent": ("profile", "script"),
            "timeline_agent": ("script", "storyboard"),
            "analytics_agent": ("profile", "performance"),
            "learning_agent": ("profile", "performance", "performanceSummary"),
        }
        return {key: state.get(key) for key in keys_by_agent.get(agent_name, tuple())}

    def _agents_for_workflow(self, workflow_type: str) -> List[BaseAgent]:
        if workflow_type == "analytics_learning":
            return self.analytics_learning_agents
        return self.content_draft_agents
