import os
import shutil
import tempfile

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from backend.src.domain.interfaces.transcriber import ITranscriber
from backend.src.domain.models.generation import (
    GeneratedMediaType,
    ProviderName,
    StoryboardRequest,
    StoryboardResponse,
    TranscriptSlice,
)
from backend.src.domain.services.storyboard_service import StoryboardService


def build_generation_router(
    storyboard_service: StoryboardService,
    transcriber: ITranscriber,
) -> APIRouter:
    router = APIRouter(prefix="/api/generation", tags=["generation"])

    @router.post("/storyboard/from-transcript", response_model=StoryboardResponse)
    async def create_storyboard_from_transcript(request: StoryboardRequest):
        if not request.transcript.strip() and not request.segments:
            raise HTTPException(status_code=400, detail="Transcript or timed segments are required")
        return storyboard_service.create_storyboard(request)

    @router.post("/storyboard/from-audio", response_model=StoryboardResponse)
    async def create_storyboard_from_audio(
        file: UploadFile = File(...),
        preferred_visual_type: GeneratedMediaType = Form("image", alias="preferredVisualType"),
        style: str = Form("cinematic realistic"),
        provider: ProviderName = Form("meta"),
    ):
        suffix = os.path.splitext(file.filename or "")[1] or ".audio"
        temp_path = _save_upload_to_temp(file, suffix)
        try:
            transcription = transcriber.transcribe(temp_path)
            transcript = " ".join(segment.text.strip() for segment in transcription.segments).strip()
            request = StoryboardRequest(
                transcript=transcript,
                segments=[
                    TranscriptSlice(start=segment.start, end=segment.end, text=segment.text)
                    for segment in transcription.segments
                ],
                preferredVisualType=preferred_visual_type,
                style=style,
                provider=provider,
            )
            response = storyboard_service.create_storyboard(request)
            return response.model_copy(
                update={
                    "transcript": transcript,
                    "segments": request.segments,
                    "duration": transcription.duration,
                }
            )
        finally:
            try:
                os.remove(temp_path)
            except OSError:
                pass

    return router


def _save_upload_to_temp(file: UploadFile, suffix: str) -> str:
    fd, temp_path = tempfile.mkstemp(prefix="neuralscribe_storyboard_", suffix=suffix)
    with os.fdopen(fd, "wb") as output:
        shutil.copyfileobj(file.file, output)
    return temp_path
