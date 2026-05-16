import uuid
from typing import List, Optional

from backend.src.domain.models.ab_testing import (
    Experiment,
    ExperimentCreateRequest,
    ExperimentUpdateRequest,
)
from backend.src.domain.models.project import utc_now_iso
from backend.src.domain.services.sqlite_store import SQLiteStore


class ABTestingService:
    def __init__(self, store: SQLiteStore):
        self.store = store

    def create_experiment(self, profile_id: str, request: ExperimentCreateRequest) -> Experiment:
        now = utc_now_iso()
        experiment = Experiment(
            id=f"experiment-{uuid.uuid4().hex[:12]}",
            profileId=profile_id,
            createdAt=now,
            updatedAt=now,
            **request.model_dump(by_alias=True),
        )
        self.store.upsert_experiment(experiment)
        return experiment

    def list_experiments(self, profile_id: str, include_archived: bool = False) -> List[Experiment]:
        return self.store.list_experiments(profile_id, include_archived=include_archived)

    def update_experiment(
        self,
        experiment_id: str,
        request: ExperimentUpdateRequest,
    ) -> Optional[Experiment]:
        existing = self.store.get_experiment(experiment_id)
        if not existing:
            return None
        updates = {
            field_name: getattr(request, field_name)
            for field_name in request.model_fields_set
        }
        experiment = existing.model_copy(
            update={
                **updates,
                "updated_at": utc_now_iso(),
            }
        )
        self.store.upsert_experiment(experiment)
        return experiment

    def archive_experiment(self, experiment_id: str) -> Optional[Experiment]:
        existing = self.store.get_experiment(experiment_id)
        if not existing:
            return None
        experiment = existing.model_copy(update={"status": "archived", "updated_at": utc_now_iso()})
        self.store.upsert_experiment(experiment)
        return experiment
