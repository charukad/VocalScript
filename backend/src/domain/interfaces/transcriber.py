from abc import ABC, abstractmethod
from typing import BinaryIO
from backend.src.domain.models.transcription import TranscriptionResult

class ITranscriber(ABC):
    @abstractmethod
    def transcribe(self, audio_file: str) -> TranscriptionResult:
        """
        Transcribe an audio file and return the result.
        
        Args:
            audio_file (str): Path to the audio file.
            
        Returns:
            TranscriptionResult: The transcription result containing segments.
        """
        pass
