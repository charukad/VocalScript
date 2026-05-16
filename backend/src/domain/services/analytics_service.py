import uuid
from typing import List, Optional

from backend.src.domain.models.analytics import (
    AnalyticsAccount,
    AnalyticsConnection,
    AnalyticsConnectionUpdateRequest,
    AnalyticsSnapshot,
    ContentPerformanceRule,
    ContentPerformance,
    ManualPerformanceImportRequest,
    ProfileLearning,
)
from backend.src.domain.models.content_profile import ContentProfileUpdateRequest, PlatformTarget
from backend.src.domain.models.project import utc_now_iso
from backend.src.domain.services.content_profile_service import ContentProfileService
from backend.src.domain.services.sqlite_store import SQLiteStore
from backend.src.infrastructure.analytics_providers import AnalyticsProviderRegistry


class AnalyticsService:
    def __init__(self, store: SQLiteStore, content_profile_service: ContentProfileService):
        self.store = store
        self.content_profile_service = content_profile_service
        self.providers = AnalyticsProviderRegistry()

    def list_connections(self, profile_id: str) -> List[AnalyticsConnection]:
        return self.store.list_analytics_connections(profile_id)

    def upsert_connection(
        self,
        profile_id: str,
        platform: PlatformTarget,
        request: AnalyticsConnectionUpdateRequest,
    ) -> Optional[AnalyticsConnection]:
        profile = self.content_profile_service.get_profile(profile_id)
        if not profile:
            return None
        existing = self.store.get_analytics_connection(profile_id, platform)
        now = utc_now_iso()
        account_id = existing.account_id if existing else None
        if request.external_account_id:
            account = AnalyticsAccount(
                id=account_id or f"analytics-account-{uuid.uuid4().hex[:12]}",
                platform=platform,
                externalAccountId=request.external_account_id,
                displayName=request.display_name,
                tokenReference=request.token_reference,
                metadata=request.metadata,
                createdAt=existing.created_at if existing else now,
                updatedAt=now,
            )
            self.store.upsert_analytics_account(account)
            account_id = account.id
        connection = AnalyticsConnection(
            id=existing.id if existing else f"analytics-connection-{uuid.uuid4().hex[:12]}",
            profileId=profile_id,
            platform=platform,
            accountId=account_id,
            status=request.status,
            externalAccountId=request.external_account_id,
            displayName=request.display_name,
            scopes=request.scopes,
            tokenReference=request.token_reference,
            metadata=request.metadata,
            createdAt=existing.created_at if existing else now,
            updatedAt=now,
        )
        self.store.upsert_analytics_connection(connection)
        statuses = {**profile.analytics_connection_status, platform: request.status}
        self.content_profile_service.update_profile(
            profile_id,
            ContentProfileUpdateRequest(analyticsConnectionStatus=statuses),
        )
        return connection

    def import_manual_performance(
        self,
        profile_id: str,
        request: ManualPerformanceImportRequest,
    ) -> Optional[ContentPerformance]:
        profile = self.content_profile_service.get_profile(profile_id)
        if not profile:
            return None
        now = utc_now_iso()
        performance = ContentPerformance(
            id=f"content-performance-{uuid.uuid4().hex[:12]}",
            profileId=profile_id,
            createdAt=now,
            updatedAt=now,
            **request.model_dump(by_alias=True),
        )
        snapshot = AnalyticsSnapshot(
            id=f"analytics-snapshot-{uuid.uuid4().hex[:12]}",
            profileId=profile_id,
            projectId=request.project_id,
            platform=request.platform,
            externalContentId=request.external_content_id,
            capturedAt=now,
            metrics=request.metrics,
            metadata={**request.metadata, "source": "manual_import"},
            createdAt=now,
            updatedAt=now,
        )
        self.store.upsert_content_performance(performance)
        self.store.upsert_analytics_snapshot(snapshot)
        if profile.analytics_connection_status.get(request.platform) != "connected":
            statuses = {**profile.analytics_connection_status, request.platform: "manual_only"}
            self.content_profile_service.update_profile(
                profile_id,
                ContentProfileUpdateRequest(analyticsConnectionStatus=statuses),
            )
        return performance

    def list_performance(self, profile_id: str) -> List[ContentPerformance]:
        return self.store.list_content_performance(profile_id)

    def replace_learning_bundle(
        self,
        profile_id: str,
        learning_payloads: List[dict],
        rule_payloads: List[dict],
    ) -> List[ProfileLearning]:
        now = utc_now_iso()
        learnings = [
            ProfileLearning(
                id=f"profile-learning-{uuid.uuid4().hex[:12]}",
                profileId=profile_id,
                learningType=item["learningType"],
                summary=item["summary"],
                data=item.get("data", {}),
                createdAt=now,
                updatedAt=now,
            )
            for item in learning_payloads
        ]
        rules = [
            ContentPerformanceRule(
                id=f"content-rule-{uuid.uuid4().hex[:12]}",
                profileId=profile_id,
                ruleKey=item["ruleKey"],
                ruleJson=item.get("ruleJson", {}),
                createdAt=now,
                updatedAt=now,
            )
            for item in rule_payloads
        ]
        self.store.replace_profile_learnings(profile_id, learnings)
        self.store.replace_content_performance_rules(profile_id, rules)
        return learnings

    def list_profile_learnings(self, profile_id: str) -> List[ProfileLearning]:
        return self.store.list_profile_learnings(profile_id)

    def list_profile_rules(self, profile_id: str) -> List[ContentPerformanceRule]:
        return self.store.list_content_performance_rules(profile_id)
