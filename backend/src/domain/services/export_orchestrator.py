import os
import shutil
import uuid
import logging
from typing import Dict, List, Tuple
from fastapi import UploadFile
from backend.src.domain.models.blueprint import TimelineBlueprint
from backend.src.domain.interfaces.media_compiler import IMediaCompiler
from backend.src.infrastructure.faster_whisper_service import FasterWhisperService

logger = logging.getLogger(__name__)

def generate_srt(segments) -> str:
    def format_timestamp(seconds: float) -> str:
        hours = int(seconds // 3600)
        minutes = int((seconds % 3600) // 60)
        secs = int(seconds % 60)
        millis = int((seconds - int(seconds)) * 1000)
        return f"{hours:02d}:{minutes:02d}:{secs:02d},{millis:03d}"

    lines = []
    for i, segment in enumerate(segments, 1):
        lines.append(str(i))
        start_time = format_timestamp(segment.start)
        end_time = format_timestamp(segment.end)
        lines.append(f"{start_time} --> {end_time}")
        lines.append(segment.text.strip())
        lines.append("")
    return "\n".join(lines)

class ExportOrchestrator:
    def __init__(self, compiler: IMediaCompiler, whisper: FasterWhisperService):
        self.compiler = compiler
        self.whisper = whisper
        self.output_dir = "backend/output"
        os.makedirs(self.output_dir, exist_ok=True)

    async def execute_export(self, blueprint: TimelineBlueprint, files: List[UploadFile]) -> Tuple[str, str]:
        """
        Executes the export sequence:
        1. Saves files temporarily
        2. Runs compiler to generate media
        3. Runs whisper to generate SRT
        4. Cleans up temp files
        Returns (output_media_path, srt_content)
        """
        session_id = uuid.uuid4().hex[:8]
        temp_dir = os.path.join(self.output_dir, f"session_{session_id}")
        os.makedirs(temp_dir, exist_ok=True)
        
        file_paths: Dict[str, str] = {}
        
        try:
            # Save uploaded files mapping their frontend ID (filename) to local path
            for file in files:
                ext = os.path.splitext(file.filename)[1]
                # Frontend must pass the `file_id` as the filename in the FormData
                file_id = file.filename 
                safe_path = os.path.join(temp_dir, f"{uuid.uuid4().hex[:4]}_{file_id}")
                with open(safe_path, "wb") as f:
                    shutil.copyfileobj(file.file, f)
                file_paths[file_id] = safe_path

            # Determine output format based on visuals
            has_visuals = any(t.type == "visual" and len(t.clips) > 0 for t in blueprint.tracks)
            output_ext = ".mp4" if has_visuals else ".mp3"
            output_path = os.path.join(self.output_dir, f"export_{session_id}{output_ext}")
            
            # 1. Compile Media
            logger.info(f"=== file_paths keys: {list(file_paths.keys())}")
            for track in blueprint.tracks:
                logger.info(f"=== Track: {track.id} type={track.type} clips={len(track.clips)}")
                for clip in track.clips:
                    logger.info(f"    clip.file_id={clip.file_id} start={clip.start_time} dur={clip.duration}")
            logger.info("Compiling sequence blueprint...")
            self.compiler.compile_sequence(blueprint, file_paths, output_path)
            
            # 2. Generate Subtitles
            # For subtitles, we transcribe the compiled output file since it contains the final mixed audio
            logger.info("Generating subtitles...")
            transcription_result = self.whisper.transcribe(output_path)
            srt_content = generate_srt(transcription_result.segments)
            
            return output_path, srt_content
            
        finally:
            # Cleanup temp inputs
            try:
                shutil.rmtree(temp_dir)
            except Exception as e:
                logger.error(f"Failed to cleanup temp dir: {e}")
