from pydantic import BaseModel
from typing import List, Optional, Literal

class TransformBlueprint(BaseModel):
    scale: float = 100.0 # percentage
    rotation: float = 0.0 # degrees
    flipX: bool = False
    flipY: bool = False

class ColorBlueprint(BaseModel):
    brightness: float = 100.0
    contrast: float = 100.0
    saturation: float = 100.0
    exposure: float = 0.0
    temperature: float = 0.0

class AudioBlueprint(BaseModel):
    volume: float = 100.0   # 0–200, 100 = normal
    mute: bool = False
    fadeIn: float = 0.0     # seconds
    fadeOut: float = 0.0    # seconds

class ClipBlueprint(BaseModel):
    file_id: str
    start_time: float
    duration: float
    in_point: float = 0.0
    volume: float = 1.0
    transform: TransformBlueprint = TransformBlueprint()
    color: ColorBlueprint = ColorBlueprint()
    audio: AudioBlueprint = AudioBlueprint()
    
class TrackBlueprint(BaseModel):
    id: str
    name: str
    type: Literal["audio", "visual", "text"]
    clips: List[ClipBlueprint]

class TimelineBlueprint(BaseModel):
    fps: int = 30
    width: int = 1920
    height: int = 1080
    tracks: List[TrackBlueprint]
