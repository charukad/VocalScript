import os
from dataclasses import dataclass
from typing import Dict


@dataclass(frozen=True)
class PublishingProviderDescriptor:
    key: str
    display_name: str
    supports_oauth: bool
    supports_live_publish: bool
    supports_scheduling: bool
    status: str
    ready_for_oauth: bool
    configuration_issues: tuple[str, ...]


class PublishingProviderRegistry:
    def __init__(self):
        youtube_issues = self._missing_config(
            "NEURALSCRIBE_YOUTUBE_CLIENT_ID",
            "NEURALSCRIBE_YOUTUBE_CLIENT_SECRET",
        )
        facebook_issues = self._missing_config(
            "NEURALSCRIBE_FACEBOOK_APP_ID",
            "NEURALSCRIBE_FACEBOOK_APP_SECRET",
        )
        tiktok_issues = self._missing_config(
            "NEURALSCRIBE_TIKTOK_CLIENT_KEY",
            "NEURALSCRIBE_TIKTOK_CLIENT_SECRET",
        )
        self._providers: Dict[str, PublishingProviderDescriptor] = {
            "youtube": PublishingProviderDescriptor(
                key="youtube",
                display_name="YouTube",
                supports_oauth=True,
                supports_live_publish=False,
                supports_scheduling=False,
                status=self._status(youtube_issues),
                ready_for_oauth=not youtube_issues,
                configuration_issues=youtube_issues,
            ),
            "youtube_shorts": PublishingProviderDescriptor(
                key="youtube_shorts",
                display_name="YouTube Shorts",
                supports_oauth=True,
                supports_live_publish=False,
                supports_scheduling=False,
                status=self._status(youtube_issues),
                ready_for_oauth=not youtube_issues,
                configuration_issues=youtube_issues,
            ),
            "facebook_page": PublishingProviderDescriptor(
                key="facebook_page",
                display_name="Facebook Page",
                supports_oauth=True,
                supports_live_publish=False,
                supports_scheduling=False,
                status=self._status(facebook_issues),
                ready_for_oauth=not facebook_issues,
                configuration_issues=facebook_issues,
            ),
            "facebook_reels": PublishingProviderDescriptor(
                key="facebook_reels",
                display_name="Facebook Reels",
                supports_oauth=True,
                supports_live_publish=False,
                supports_scheduling=False,
                status=self._status(facebook_issues),
                ready_for_oauth=not facebook_issues,
                configuration_issues=facebook_issues,
            ),
            "tiktok": PublishingProviderDescriptor(
                key="tiktok",
                display_name="TikTok",
                supports_oauth=True,
                supports_live_publish=False,
                supports_scheduling=False,
                status=self._status(tiktok_issues),
                ready_for_oauth=not tiktok_issues,
                configuration_issues=tiktok_issues,
            ),
        }

    def list(self) -> list[PublishingProviderDescriptor]:
        return list(self._providers.values())

    def get(self, key: str) -> PublishingProviderDescriptor | None:
        return self._providers.get(key)

    def _missing_config(self, *keys: str) -> tuple[str, ...]:
        return tuple(key for key in keys if not os.getenv(key, "").strip())

    def _status(self, issues: tuple[str, ...]) -> str:
        return "needs_configuration" if issues else "oauth_ready"
