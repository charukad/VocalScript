from dataclasses import dataclass
from typing import Dict


@dataclass(frozen=True)
class AnalyticsProviderDescriptor:
    key: str
    display_name: str
    supports_oauth: bool
    status: str


class AnalyticsProviderRegistry:
    def __init__(self):
        self._providers: Dict[str, AnalyticsProviderDescriptor] = {
            "youtube": AnalyticsProviderDescriptor(
                key="youtube",
                display_name="YouTube Analytics",
                supports_oauth=True,
                status="placeholder",
            ),
            "youtube_shorts": AnalyticsProviderDescriptor(
                key="youtube_shorts",
                display_name="YouTube Analytics",
                supports_oauth=True,
                status="placeholder",
            ),
            "facebook_page": AnalyticsProviderDescriptor(
                key="facebook_page",
                display_name="Facebook Page Insights",
                supports_oauth=True,
                status="placeholder",
            ),
            "facebook_reels": AnalyticsProviderDescriptor(
                key="facebook_reels",
                display_name="Facebook Page Insights",
                supports_oauth=True,
                status="placeholder",
            ),
        }

    def get(self, platform: str) -> AnalyticsProviderDescriptor | None:
        return self._providers.get(platform)
