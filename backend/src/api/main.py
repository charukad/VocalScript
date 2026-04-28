from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import Response, JSONResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from backend.src.infrastructure.faster_whisper_service import FasterWhisperService
from backend.src.domain.services.subtitle_generator import SubtitleGenerator
from backend.src.domain.services.audio_merger import AudioMergerService
from typing import List
import tempfile
import os
import uuid
import logging
from contextlib import asynccontextmanager

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Global instances
transcriber = None

# Store merged audio files in a persistent temp directory or local directory for download
AUDIO_OUTPUT_DIR = os.path.join(os.getcwd(), "backend", "output")
os.makedirs(AUDIO_OUTPUT_DIR, exist_ok=True)

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
async def transcribe_audio(files: List[UploadFile] = File(...)):
    if not files or len(files) == 0:
        raise HTTPException(status_code=400, detail="No files provided")
    
    temp_paths = []
    output_filename = f"merged_{uuid.uuid4().hex[:8]}.mp3"
    merged_path = os.path.join(AUDIO_OUTPUT_DIR, output_filename)
    
    try:
        # 1. Save all uploaded files to temporary locations
        for file in files:
            suffix = os.path.splitext(file.filename)[1] if file.filename else ".tmp"
            tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
            content = await file.read()
            tmp.write(content)
            tmp.close()
            temp_paths.append(tmp.name)
            
        logger.info(f"Saved {len(temp_paths)} temporary files.")
        
        # 2. Merge files if there are multiple, otherwise just use the single file
        if len(temp_paths) > 1:
            AudioMergerService.merge_audio_files(temp_paths, merged_path)
            target_audio_for_transcription = merged_path
        else:
            # Just convert the single file to mp3 and save it for download consistency
            AudioMergerService.merge_audio_files(temp_paths, merged_path)
            target_audio_for_transcription = merged_path
            
        # 3. Transcribe the merged audio
        result = transcriber.transcribe(target_audio_for_transcription)
        
        # 4. Generate SRT
        srt_content = SubtitleGenerator.generate_srt(result)
        
        # Return JSON containing the SRT text and the download URL for the merged audio
        return JSONResponse(content={
            "srtContent": srt_content,
            "audioUrl": f"/api/audio/{output_filename}"
        })
        
    except Exception as e:
        logger.error(f"Error during transcription: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        # Clean up temporary individual files
        for tmp_path in temp_paths:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)

@app.get("/api/audio/{filename}")
async def get_merged_audio(filename: str):
    file_path = os.path.join(AUDIO_OUTPUT_DIR, filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Audio file not found")
        
    return FileResponse(
        path=file_path, 
        media_type="audio/mpeg", 
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )
