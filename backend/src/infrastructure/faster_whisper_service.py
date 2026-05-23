from backend.src.domain.interfaces.transcriber import ITranscriber
from backend.src.domain.models.transcription import TranscriptionResult, TranscriptionSegment
from faster_whisper import WhisperModel
import logging
from typing import Optional

logger = logging.getLogger(__name__)

class FasterWhisperService(ITranscriber):
    def __init__(self, model_size: str = "base", device: str = "auto", compute_type: str = "default"):
        """
        Initialize the Faster Whisper model.
        Args:
            model_size: 'tiny', 'base', 'small', 'medium', 'large-v3'
            device: 'auto', 'cpu', 'cuda'
            compute_type: 'default', 'float16', 'int8_float16', 'int8'
        """
        logger.info(f"Loading faster-whisper model: {model_size} on {device}")
        self.model = WhisperModel(model_size, device=device, compute_type=compute_type)
        logger.info("Model loaded successfully")

    def transcribe(self, audio_file: str, language: Optional[str] = None) -> TranscriptionResult:
        logger.info(f"Transcribing audio file: {audio_file}")
        
        # We use word_timestamps=False to keep things fast, but it can be enabled if needed.
        segments, info = self.model.transcribe(
            audio_file,
            beam_size=5,
            language=language,
            task="transcribe",
        )
        
        result_segments = []
        # 'segments' is a generator, so we iterate to get all segments
        for segment in segments:
            result_segments.append(
                TranscriptionSegment(
                    start=segment.start,
                    end=segment.end,
                    text=segment.text
                )
            )
            
        logger.info(f"Transcription complete. Language: {info.language}, Duration: {info.duration}s")
        
        return TranscriptionResult(
            segments=result_segments,
            language=info.language,
            duration=info.duration
        )
