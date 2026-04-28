from typing import List, Optional
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import json
import logging
from pydantic import ValidationError

from backend.src.domain.models.blueprint import TimelineBlueprint
from backend.src.infrastructure.ffmpeg_compiler import FFmpegMediaCompiler
from backend.src.infrastructure.faster_whisper_service import FasterWhisperService
from backend.src.domain.services.export_orchestrator import ExportOrchestrator

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
