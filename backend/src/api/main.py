from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import Response, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from backend.src.infrastructure.faster_whisper_service import FasterWhisperService
from backend.src.domain.services.subtitle_generator import SubtitleGenerator
import tempfile
import os
import logging
from contextlib import asynccontextmanager

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Global instances
transcriber = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global transcriber
    logger.info("Initializing transcriber model on startup...")
    # Use 'cpu' by default to ensure it works everywhere, change to 'cuda'/'mps' if appropriate
    transcriber = FasterWhisperService(model_size="base", device="cpu", compute_type="default")
    yield
    logger.info("Shutting down...")

app = FastAPI(title="Offline Subtitle Creator API", lifespan=lifespan)

# Allow CORS for local frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins for local dev
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
async def health_check():
    return {"status": "ok", "model": "loaded" if transcriber else "loading"}

@app.post("/api/transcribe")
async def transcribe_audio(file: UploadFile = File(...)):
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")
    
    # Save uploaded file to a temporary location
    try:
        suffix = os.path.splitext(file.filename)[1]
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            content = await file.read()
            tmp.write(content)
            tmp_path = tmp.name
            
        logger.info(f"File saved temporarily to {tmp_path}")
        
        # Transcribe
        result = transcriber.transcribe(tmp_path)
        
        # Generate SRT
        srt_content = SubtitleGenerator.generate_srt(result)
        
        # Return as a file download
        filename_without_ext = os.path.splitext(file.filename)[0]
        srt_filename = f"{filename_without_ext}.srt"
        
        return Response(
            content=srt_content,
            media_type="text/plain",
            headers={"Content-Disposition": f'attachment; filename="{srt_filename}"'}
        )
        
    except Exception as e:
        logger.error(f"Error during transcription: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if 'tmp_path' in locals() and os.path.exists(tmp_path):
            os.remove(tmp_path)
