from abc import ABC, abstractmethod
from typing import Dict
from backend.src.domain.models.blueprint import TimelineBlueprint

class IMediaCompiler(ABC):
    @abstractmethod
    def compile_sequence(self, blueprint: TimelineBlueprint, file_paths: Dict[str, str], output_path: str) -> None:
        """
        Compiles the timeline blueprint into a final media file at output_path.
        file_paths is a dictionary mapping `file_id` (from blueprint) to absolute local paths.
        """
        pass
