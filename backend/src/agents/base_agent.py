from abc import ABC, abstractmethod
from typing import Any, Dict


AgentState = Dict[str, Any]


class BaseAgent(ABC):
    name: str

    @abstractmethod
    def run(self, state: AgentState) -> Dict[str, Any]:
        raise NotImplementedError
