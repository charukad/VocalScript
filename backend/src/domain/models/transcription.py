from pydantic import BaseModel
from typing import List

class TranscriptionSegment(BaseModel):
    start: float
    end: float
    text: str

class TranscriptionResult(BaseModel):
    segments: List[TranscriptionSegment]
    language: str
    duration: float
