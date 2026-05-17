from dataclasses import dataclass
from typing import Dict


@dataclass(frozen=True)
class TrendSourceProviderDescriptor:
    key: str
    display_name: str
    source_type: str
    requires_credentials: bool
    status: str


class TrendSourceRegistry:
    def __init__(self):
        self._providers: Dict[str, TrendSourceProviderDescriptor] = {
            "manual": TrendSourceProviderDescriptor(
                key="manual",
                display_name="Manual capture",
                source_type="manual",
                requires_credentials=False,
                status="ready",
            ),
            "rule_based_fallback": TrendSourceProviderDescriptor(
                key="rule_based_fallback",
                display_name="Local suggestions",
                source_type="local",
                requires_credentials=False,
                status="ready",
            ),
            "rss_feed": TrendSourceProviderDescriptor(
                key="rss_feed",
                display_name="RSS / Atom feed",
                source_type="external_feed",
                requires_credentials=False,
                status="ready",
            ),
            "external_api": TrendSourceProviderDescriptor(
                key="external_api",
                display_name="External trend APIs",
                source_type="external_api",
                requires_credentials=True,
                status="blocked_pending_credentials",
            ),
        }

    def list(self) -> list[TrendSourceProviderDescriptor]:
        return list(self._providers.values())
