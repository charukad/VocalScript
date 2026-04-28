from pydantic import BaseModel
from typing import List, Optional, Literal

class ClipBlueprint(BaseModel):
    file_id: str
    start_time: float # where it sits on the timeline in seconds
    duration: float   # duration on the timeline
    in_point: float = 0.0 # offset within the media file itself
    volume: float = 1.0   # 0.0 to 1.0+
    
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
