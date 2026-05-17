from pydantic import BaseModel
from typing import List, Optional, Literal

class TransformBlueprint(BaseModel):
    scale: float = 100.0 # percentage
    rotation: float = 0.0 # degrees
    opacity: float = 100.0
    x: float = 50.0
    y: float = 50.0
    flipX: bool = False
    flipY: bool = False

class CropBlueprint(BaseModel):
    left: float = 0.0
    right: float = 0.0
    top: float = 0.0
    bottom: float = 0.0

class ColorBlueprint(BaseModel):
    brightness: float = 100.0
    contrast: float = 100.0
    saturation: float = 100.0
    exposure: float = 0.0
    temperature: float = 0.0
    highlights: float = 0.0
    shadows: float = 0.0
    red: float = 0.0
    green: float = 0.0
    blue: float = 0.0

class EffectsBlueprint(BaseModel):
    blur: float = 0.0
    sharpen: float = 0.0
    vignette: float = 0.0
    clarity: float = 0.0
    overlayPreset: Literal["none", "glitch", "vhs", "light_leak"] = "none"
    overlayIntensity: float = 0.0

class SpeedBlueprint(BaseModel):
    rate: float = 1.0
    reverse: bool = False
    freezeFrame: bool = False
    curvePreset: Literal["constant", "ramp_up", "ramp_down"] = "constant"

class CompositingBlueprint(BaseModel):
    blendMode: Literal["normal", "screen", "multiply", "overlay"] = "normal"
    layoutPreset: Literal["free", "pip_top_right", "pip_bottom_left", "split_left", "split_right"] = "free"
    borderWidth: float = 0.0
    borderColor: str = "#ffffff"
    maskShape: Literal["none", "circle", "rounded"] = "none"
    cornerRadius: float = 0.0
    chromaKeyEnabled: bool = False
    chromaKeyColor: str = "#00ff00"
    chromaKeySimilarity: float = 0.2
    spillSuppression: float = 0.0
    edgeFeather: float = 0.0
    stabilization: bool = False
    backgroundRemoval: bool = False

class AudioBlueprint(BaseModel):
    volume: float = 100.0   # 0–200, 100 = normal
    mute: bool = False
    fadeIn: float = 0.0     # seconds
    fadeOut: float = 0.0    # seconds
    fadeInCurve: Literal["linear", "ease_in", "ease_out", "smooth"] = "linear"
    fadeOutCurve: Literal["linear", "ease_in", "ease_out", "smooth"] = "linear"

class TextBlueprint(BaseModel):
    content: str = "Text"
    fontFamily: str = "sans-serif"
    fontSize: int = 48
    color: str = "#ffffff"
    bold: bool = False
    italic: bool = False
    align: Literal["left", "center", "right"] = "center"
    x: float = 50.0
    y: float = 85.0
    bgColor: str = "#000000"
    bgOpacity: float = 0.0
    shadowColor: str = "#000000"
    shadowOpacity: float = 0.6
    shadowBlur: float = 6.0
    shadowOffsetX: float = 0.0
    shadowOffsetY: float = 3.0
    strokeColor: str = "#000000"
    strokeWidth: int = 0
    boxPadding: int = 14
    boxRadius: int = 10
    maxWidthPercent: float = 82.0
    maxCharsPerLine: int = 28

class ClipBlueprint(BaseModel):
    file_id: str
    start_time: float
    duration: float
    in_point: float = 0.0
    volume: float = 1.0
    transform: TransformBlueprint = TransformBlueprint()
    crop: CropBlueprint = CropBlueprint()
    color: ColorBlueprint = ColorBlueprint()
    effects: EffectsBlueprint = EffectsBlueprint()
    speed: SpeedBlueprint = SpeedBlueprint()
    compositing: CompositingBlueprint = CompositingBlueprint()
    audio: AudioBlueprint = AudioBlueprint()
    text: Optional[TextBlueprint] = None

class TrackBlueprint(BaseModel):
    id: str
    name: str
    type: Literal["audio", "visual", "text"]
    clips: List[ClipBlueprint]

class TimelineBlueprint(BaseModel):
    fps: int = 30
    width: int = 1920
    height: int = 1080
    crf: int = 23
    audio_only: bool = False
    tracks: List[TrackBlueprint]
