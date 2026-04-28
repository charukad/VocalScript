from backend.src.domain.models.transcription import TranscriptionResult
import math

class SubtitleGenerator:
    @staticmethod
    def _format_time(seconds: float) -> str:
        """Formats seconds into SRT timestamp format (HH:MM:SS,mmm)"""
        hours = math.floor(seconds / 3600)
        seconds %= 3600
        minutes = math.floor(seconds / 60)
        seconds %= 60
        milliseconds = round((seconds - math.floor(seconds)) * 1000)
        seconds = math.floor(seconds)
        
        return f"{hours:02d}:{minutes:02d}:{seconds:02d},{milliseconds:03d}"

    @staticmethod
    def generate_srt(result: TranscriptionResult) -> str:
        """
        Converts a TranscriptionResult into SRT formatted text.
        """
        srt_content = []
        for i, segment in enumerate(result.segments, start=1):
            start_time = SubtitleGenerator._format_time(segment.start)
            end_time = SubtitleGenerator._format_time(segment.end)
            
            srt_content.append(str(i))
            srt_content.append(f"{start_time} --> {end_time}")
            srt_content.append(segment.text.strip())
            srt_content.append("") # Empty line between subtitles
            
        return "\n".join(srt_content)
