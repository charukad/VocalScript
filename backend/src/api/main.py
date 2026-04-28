from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.responses import Response, JSONResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from backend.src.infrastructure.faster_whisper_service import FasterWhisperService
from backend.src.domain.services.subtitle_generator import SubtitleGenerator
from backend.src.domain.services.media_merger import MediaMergerService
from typing import List, Optional
import tempfile
import os
import uuid
import logging
from contextlib import asynccontextmanager

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Global instances
transcriber = None

# Store merged audio/video files in a persistent temp directory
MEDIA_OUTPUT_DIR = os.path.join(os.getcwd(), "backend", "output")
os.makedirs(MEDIA_OUTPUT_DIR, exist_ok=True)

@asynccontextmanager
async def lifespan(app: FastAPI):
    global transcriber
    logger.info("Initializing transcriber model on startup...")
    transcriber = FasterWhisperService(model_size="base", device="cpu", compute_type="default")
    yield
    logger.info("Shutting down...")

app = FastAPI(title="Offline Subtitle Creator API", lifespan=lifespan)

# Allow CORS for local frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
async def health_check():
    return {"status": "ok", "model": "loaded" if transcriber else "loading"}

@app.post("/api/transcribe")
async def process_media(
    files: List[UploadFile] = File(...),
    visual_file: Optional[UploadFile] = File(None)
):
    if not files or len(files) == 0:
        raise HTTPException(status_code=400, detail="No audio files provided")
    
    temp_audio_paths = []
    visual_temp_path = None
    
    # Determine output extension
    ext = ".mp4" if visual_file else ".mp3"
    output_filename = f"merged_{uuid.uuid4().hex[:8]}{ext}"
    merged_path = os.path.join(MEDIA_OUTPUT_DIR, output_filename)
    
    try:
        # 1. Save all uploaded audio files to temporary locations
        for file in files:
            suffix = os.path.splitext(file.filename)[1] if file.filename else ".tmp"
            tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
            content = await file.read()
            tmp.write(content)
            tmp.close()
            temp_audio_paths.append(tmp.name)
            
        logger.info(f"Saved {len(temp_audio_paths)} temporary audio files.")
        
        # 2. Save visual file if provided
        if visual_file:
            v_suffix = os.path.splitext(visual_file.filename)[1] if visual_file.filename else ".tmp"
            v_tmp = tempfile.NamedTemporaryFile(delete=False, suffix=v_suffix)
            v_content = await visual_file.read()
            v_tmp.write(v_content)
            v_tmp.close()
            visual_temp_path = v_tmp.name
            logger.info(f"Saved visual file to {visual_temp_path}")
            
        # 3. Merge files
        MediaMergerService.process_media(temp_audio_paths, visual_temp_path, merged_path)
            
        # 4. Transcribe the merged media (whisper handles mp4 and mp3 equally well)
        result = transcriber.transcribe(merged_path)
        
        # 5. Generate SRT
        srt_content = SubtitleGenerator.generate_srt(result)
        
        # Return JSON containing the SRT text and the download URL for the merged media
        return JSONResponse(content={
            "srtContent": srt_content,
            "mediaUrl": f"/api/media/{output_filename}"
        })
        
    except Exception as e:
        logger.error(f"Error during media processing: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        # Clean up temporary individual files
        for tmp_path in temp_audio_paths:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)
        if visual_temp_path and os.path.exists(visual_temp_path):
            os.remove(visual_temp_path)

@app.get("/api/media/{filename}")
async def get_merged_media(filename: str):
    file_path = os.path.join(MEDIA_OUTPUT_DIR, filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Media file not found")
        
    media_type = "video/mp4" if filename.endswith(".mp4") else "audio/mpeg"
        
    return FileResponse(
        path=file_path, 
        media_type=media_type, 
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )
