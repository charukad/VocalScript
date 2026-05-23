from abc import ABC, abstractmethod
from typing import Optional
from backend.src.domain.models.transcription import TranscriptionResult

class ITranscriber(ABC):
    @abstractmethod
    def transcribe(self, audio_file: str, language: Optional[str] = None) -> TranscriptionResult:
        """
        Transcribe an audio file and return the result.
        
        Args:
            audio_file (str): Path to the audio file.
            language (Optional[str]): Whisper language code to force, or None to auto-detect.
            
        Returns:
            TranscriptionResult: The transcription result containing segments.
        """
        pass
