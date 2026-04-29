from typing import List, Optional
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import json
import logging
import os
import shutil
import tempfile
from pydantic import ValidationError

from backend.src.domain.models.blueprint import TimelineBlueprint
from backend.src.infrastructure.ffmpeg_compiler import FFmpegMediaCompiler
from backend.src.infrastructure.faster_whisper_service import FasterWhisperService
from backend.src.infrastructure.local_llm_service import LocalLLMService
from backend.src.domain.services.export_orchestrator import ExportOrchestrator, generate_srt
from backend.src.domain.services.browser_bridge_service import BrowserBridgeService
from backend.src.domain.services.generation_queue_service import GenerationQueueService
from backend.src.domain.services.storyboard_service import StoryboardService
from backend.src.api.browser_bridge import build_browser_bridge_router
from backend.src.api.generation import build_generation_router
from backend.src.config import settings

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize Infrastructure & Services
compiler = FFmpegMediaCompiler()
whisper_engine = FasterWhisperService(model_size="tiny", device="cpu", compute_type="int8")
orchestrator = ExportOrchestrator(compiler, whisper_engine)
local_llm_service = LocalLLMService(settings.llm)
storyboard_service = StoryboardService(local_llm_service)
generation_queue_service = GenerationQueueService(settings.browser_bridge.generated_media_dir)
browser_bridge_service = BrowserBridgeService()
app.include_router(build_generation_router(storyboard_service, whisper_engine, generation_queue_service))
app.include_router(build_browser_bridge_router(browser_bridge_service, settings.browser_bridge.session_token))

def _format_vtt_timestamp(seconds: float) -> str:
    safe = max(0.0, seconds)
    hours = int(safe // 3600)
    minutes = int((safe % 3600) // 60)
    secs = int(safe % 60)
    millis = int((safe - int(safe)) * 1000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d}.{millis:03d}"

def generate_vtt(segments) -> str:
    lines = ["WEBVTT", ""]
    for segment in segments:
        start_time = _format_vtt_timestamp(segment.start)
        end_time = _format_vtt_timestamp(segment.end)
        lines.append(f"{start_time} --> {end_time}")
        lines.append(segment.text.strip())
        lines.append("")
    return "\n".join(lines)

@app.post("/api/transcribe")
async def transcribe_media(file: UploadFile = File(...)):
    """
    Generate transcript/captions from one uploaded audio or video file without exporting media.
    """
    original_name = file.filename or "media"
    suffix = os.path.splitext(original_name)[1] or ".media"
    temp_file = tempfile.NamedTemporaryFile(delete=False, suffix=suffix, prefix="neuralscribe_transcribe_")
    temp_path = temp_file.name
    temp_file.close()

    try:
        with open(temp_path, "wb") as output:
            shutil.copyfileobj(file.file, output)

        transcription_result = whisper_engine.transcribe(temp_path)
        segments = [
            {
                "id": f"caption-{index}",
                "index": index,
                "start": segment.start,
                "end": segment.end,
                "text": segment.text.strip(),
            }
            for index, segment in enumerate(transcription_result.segments, 1)
        ]

        return JSONResponse(content={
            "segments": segments,
            "srtContent": generate_srt(transcription_result.segments),
            "vttContent": generate_vtt(transcription_result.segments),
            "language": transcription_result.language,
            "duration": transcription_result.duration,
            "sourceName": original_name,
        })
    except Exception as e:
        logger.exception("Transcription failed")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        try:
            os.remove(temp_path)
        except OSError:
            pass

@app.post("/api/export")
async def export_sequence(
    blueprint: str = Form(...),
    files: List[UploadFile] = File(...)
):
    """
    Export sequence using the Timeline Blueprint schema.
    """
    try:
        # 1. Parse the blueprint JSON
        blueprint_dict = json.loads(blueprint)
        timeline = TimelineBlueprint(**blueprint_dict)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON format for blueprint")
    except ValidationError as e:
        raise HTTPException(status_code=422, detail=f"Blueprint schema validation error: {e}")
        
    try:
        output_path, srt_content = await orchestrator.execute_export(timeline, files)
        
        # We need to return both the file and the SRT content. 
        # A simple way is to return the file URL/path and the SRT string in a JSON wrapper,
        # but since we want the actual file bytes, we can write a dedicated download endpoint 
        # or return a JSON containing the SRT and a unique filename, then the frontend makes a second GET request.
        
        # Return JSON with SRT and the filename
        import os
        filename = os.path.basename(output_path)
        return JSONResponse(content={
            "srtContent": srt_content,
            "mediaUrl": f"/api/download/{filename}"
        })
        
    except Exception as e:
        logger.exception("Export failed")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/download/{filename}")
async def download_media(filename: str):
    import os
    file_path = os.path.join("backend/output", filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(file_path)
