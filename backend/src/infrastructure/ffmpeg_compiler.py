import os
import math
import subprocess
import logging
from typing import Dict, Optional
from backend.src.domain.interfaces.media_compiler import IMediaCompiler
from backend.src.domain.models.blueprint import TimelineBlueprint

logger = logging.getLogger(__name__)

# Video extensions that typically carry an embedded audio stream
VIDEO_EXTS = {'.mp4', '.mov', '.mkv', '.avi', '.webm', '.m4v', '.m4p'}

# Font candidates used when rasterizing text overlays with Pillow. This avoids
# relying on FFmpeg's optional drawtext filter, which is not present in all builds.
FONT_CANDIDATES = {
    "arial": {
        "regular": "/System/Library/Fonts/Supplemental/Arial.ttf",
        "bold": "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
        "italic": "/System/Library/Fonts/Supplemental/Arial Italic.ttf",
        "bold_italic": "/System/Library/Fonts/Supplemental/Arial Bold Italic.ttf",
    },
    "georgia": {
        "regular": "/System/Library/Fonts/Supplemental/Georgia.ttf",
        "bold": "/System/Library/Fonts/Supplemental/Georgia Bold.ttf",
        "italic": "/System/Library/Fonts/Supplemental/Georgia Italic.ttf",
        "bold_italic": "/System/Library/Fonts/Supplemental/Georgia Bold Italic.ttf",
    },
    "courier": {
        "regular": "/System/Library/Fonts/Supplemental/Courier New.ttf",
        "bold": "/System/Library/Fonts/Supplemental/Courier New Bold.ttf",
        "italic": "/System/Library/Fonts/Supplemental/Courier New Italic.ttf",
        "bold_italic": "/System/Library/Fonts/Supplemental/Courier New Bold Italic.ttf",
    },
    "impact": {
        "regular": "/System/Library/Fonts/Supplemental/Impact.ttf",
        "bold": "/System/Library/Fonts/Supplemental/Impact.ttf",
        "italic": "/System/Library/Fonts/Supplemental/Impact.ttf",
        "bold_italic": "/System/Library/Fonts/Supplemental/Impact.ttf",
    },
    "default": {
        "regular": "/System/Library/Fonts/Helvetica.ttc",
        "bold": "/System/Library/Fonts/Helvetica.ttc",
        "italic": "/System/Library/Fonts/Helvetica.ttc",
        "bold_italic": "/System/Library/Fonts/Helvetica.ttc",
    },
}


def _load_pillow():
    try:
        from PIL import Image, ImageColor, ImageDraw, ImageFilter, ImageFont
        return Image, ImageColor, ImageDraw, ImageFilter, ImageFont
    except ImportError as exc:
        raise RuntimeError(
            "Text overlays require Pillow. Install backend dependencies again with "
            "`pip install -r backend/requirements.txt`."
        ) from exc


def _font_path(font_family: str, bold: bool, italic: bool) -> Optional[str]:
    family = font_family.lower()
    if "impact" in family:
        group = FONT_CANDIDATES["impact"]
    elif "courier" in family:
        group = FONT_CANDIDATES["courier"]
    elif "georgia" in family:
        group = FONT_CANDIDATES["georgia"]
    elif "arial" in family:
        group = FONT_CANDIDATES["arial"]
    else:
        group = FONT_CANDIDATES["default"]

    style = "bold_italic" if bold and italic else "bold" if bold else "italic" if italic else "regular"
    for candidate in (group.get(style), group.get("regular"), FONT_CANDIDATES["default"]["regular"]):
        if candidate and os.path.exists(candidate):
            return candidate
    return None


def _wrap_text(draw, text: str, font, max_width: int, max_chars_per_line: int) -> list[str]:
    wrapped: list[str] = []
    for raw_line in text.splitlines() or [""]:
        words = raw_line.split(" ")
        line = ""
        for word in words:
            candidate = word if not line else f"{line} {word}"
            bbox = draw.textbbox((0, 0), candidate, font=font)
            within_char_limit = len(candidate) <= max_chars_per_line if max_chars_per_line > 0 else True
            if (bbox[2] - bbox[0] <= max_width and within_char_limit) or not line:
                line = candidate
            else:
                wrapped.append(line)
                line = word
        wrapped.append(line)
    return wrapped


def _hex_to_rgba(ImageColor, color: str, alpha: float = 1.0) -> tuple[int, int, int, int]:
    rgb = ImageColor.getrgb(color)
    if len(rgb) == 4:
        rgb = rgb[:3]
    return (*rgb, max(0, min(255, int(alpha * 255))))

class FFmpegMediaCompiler(IMediaCompiler):
    def _has_keyframes(self, clip, property_name: str) -> bool:
        return any(keyframe.property == property_name for keyframe in (clip.keyframes or []))

    def _keyframe_expr(
        self,
        clip,
        property_name: str,
        fallback: float,
        scale: float = 1.0,
        time_var: str = "t",
    ) -> str:
        frames = sorted(
            (
                keyframe
                for keyframe in (clip.keyframes or [])
                if keyframe.property == property_name and math.isfinite(keyframe.time) and math.isfinite(keyframe.value)
            ),
            key=lambda keyframe: keyframe.time,
        )
        if not frames:
            return f"{fallback * scale:.6f}"
        if len(frames) == 1:
            return f"{frames[0].value * scale:.6f}"

        def value(keyframe) -> str:
            return f"{keyframe.value * scale:.6f}"

        def progress(previous, next_frame) -> str:
            span = max(0.001, next_frame.time - previous.time)
            raw = f"(({time_var}-{previous.time:.6f})/{span:.6f})"
            if previous.easing == "ease_in":
                return f"pow({raw},2)"
            if previous.easing == "ease_out":
                return f"(1-pow(1-{raw},2))"
            if previous.easing == "ease_in_out":
                return f"if(lt({raw},0.5),2*pow({raw},2),1-pow(-2*{raw}+2,2)/2)"
            return raw

        expr = value(frames[-1])
        for previous, next_frame in reversed(list(zip(frames, frames[1:]))):
            segment_progress = progress(previous, next_frame)
            segment_value = (
                f"({value(previous)}+({value(next_frame)}-{value(previous)})*({segment_progress}))"
            )
            expr = f"if(lte({time_var},{next_frame.time:.6f}),{segment_value},{expr})"
        return f"if(lte({time_var},{frames[0].time:.6f}),{value(frames[0])},{expr})"

    def _render_text_overlay(self, td, blueprint: TimelineBlueprint, output_path: str, index: int) -> str:
        Image, ImageColor, ImageDraw, ImageFilter, ImageFont = _load_pillow()

        width, height = blueprint.width, blueprint.height
        image = Image.new("RGBA", (width, height), (0, 0, 0, 0))
        draw = ImageDraw.Draw(image)

        font_path = _font_path(td.fontFamily, td.bold, td.italic)
        try:
            font = ImageFont.truetype(font_path, td.fontSize) if font_path else ImageFont.load_default()
        except Exception:
            logger.warning("Failed to load font %s, using Pillow default", font_path)
            font = ImageFont.load_default()

        max_text_width = int(width * max(0.1, min(1.0, td.maxWidthPercent / 100.0)))
        lines = _wrap_text(draw, td.content, font, max_text_width, td.maxCharsPerLine)
        spacing = max(4, int(td.fontSize * 0.2))
        line_boxes = [draw.textbbox((0, 0), line or " ", font=font) for line in lines]
        line_widths = [box[2] - box[0] for box in line_boxes]
        line_heights = [box[3] - box[1] for box in line_boxes]
        text_width = min(max(line_widths or [0]), max_text_width)
        text_height = sum(line_heights) + spacing * max(0, len(lines) - 1)

        pad_x = td.boxPadding if td.bgOpacity > 0 else 0
        pad_y = max(0, math.ceil(td.boxPadding * 0.6)) if td.bgOpacity > 0 else 0
        box_width = text_width + pad_x * 2
        box_height = text_height + pad_y * 2

        left = int(width * (td.x / 100.0) - box_width / 2)
        top = int(height * (td.y / 100.0) - box_height / 2)
        left = max(0, min(width - box_width, left))
        top = max(0, min(height - box_height, top))

        if td.bgOpacity > 0:
            bg = _hex_to_rgba(ImageColor, td.bgColor, td.bgOpacity)
            draw.rounded_rectangle(
                [left, top, left + box_width, top + box_height],
                radius=max(0, td.boxRadius),
                fill=bg,
            )

        text_color = _hex_to_rgba(ImageColor, td.color, 1.0)
        stroke_color = _hex_to_rgba(ImageColor, td.strokeColor, 1.0)
        shadow_color = _hex_to_rgba(ImageColor, td.shadowColor, td.shadowOpacity)
        y = top + pad_y
        for line, line_width, line_height in zip(lines, line_widths, line_heights):
            if td.align == "left":
                x = left + pad_x
            elif td.align == "right":
                x = left + box_width - pad_x - line_width
            else:
                x = left + (box_width - line_width) / 2

            if td.shadowOpacity > 0:
                shadow_layer = Image.new("RGBA", image.size, (0, 0, 0, 0))
                shadow_draw = ImageDraw.Draw(shadow_layer)
                shadow_draw.text(
                    (x + td.shadowOffsetX, y + td.shadowOffsetY),
                    line,
                    font=font,
                    fill=shadow_color,
                    stroke_width=max(0, td.strokeWidth),
                    stroke_fill=stroke_color,
                )
                if td.shadowBlur > 0:
                    shadow_layer = shadow_layer.filter(ImageFilter.GaussianBlur(td.shadowBlur))
                image.alpha_composite(shadow_layer)
            draw.text(
                (x, y),
                line,
                font=font,
                fill=text_color,
                stroke_width=max(0, td.strokeWidth),
                stroke_fill=stroke_color,
            )
            y += line_height + spacing

        overlay_path = os.path.join(os.path.dirname(output_path), f".text_overlay_{os.getpid()}_{index}.png")
        image.save(overlay_path)
        return overlay_path

    def compile_sequence(self, blueprint: TimelineBlueprint, file_paths: Dict[str, str], output_path: str) -> None:
        cmd = ["ffmpeg", "-y"]
        text_overlay_paths = []

        # 1. Map input files to indices
        input_idx_map = {}
        idx = 0
        for file_id, path in file_paths.items():
            cmd.extend(["-i", path])
            input_idx_map[file_id] = idx
            idx += 1

        filter_complex = []

        # Determine total duration (exclude text tracks — they carry no media)
        total_duration = 0.0
        for track in blueprint.tracks:
            if track.type == "text":
                continue
            for clip in track.clips:
                total_duration = max(total_duration, clip.start_time + clip.duration)

        if total_duration == 0:
            raise ValueError("Sequence duration is 0")

        # ─── Audio Processing ──────────────────────────────────────────────
        audio_outs = []
        narration_ranges = [
            (clip.start_time, clip.start_time + clip.duration)
            for track in blueprint.tracks
            for clip in track.clips
            if clip.audio.duckingRole == "narration"
        ]

        def process_audio_clip(clip, node_prefix: str, in_idx: int) -> None:
            """Extract, volume-adjust, fade, and delay an audio clip into audio_outs."""
            effective_volume = 0.0 if clip.audio.mute else (clip.audio.volume / 100.0)
            curve_map = {
                "linear": "tri",
                "ease_in": "qua",
                "ease_out": "iqsin",
                "smooth": "hsin",
            }

            processing_filters = [
                f"atrim=start={clip.in_point}:duration={clip.duration}",
                "asetpts=PTS-STARTPTS",
            ]
            if clip.audio.eqPreset == "voice":
                processing_filters.extend(["highpass=f=80", "lowpass=f=12000", "equalizer=f=3500:t=q:w=1:g=2"])
            elif clip.audio.eqPreset == "bass_boost":
                processing_filters.append("bass=g=5")
            elif clip.audio.eqPreset == "bright":
                processing_filters.append("treble=g=4")
            elif clip.audio.eqPreset == "music":
                processing_filters.append("dynaudnorm=f=150:g=7")
            if clip.audio.noiseReduction > 0:
                noise_floor = max(-80.0, min(-10.0, -15.0 - clip.audio.noiseReduction * 0.45))
                processing_filters.append(f"afftdn=nf={noise_floor:.1f}")
            if clip.audio.voiceEnhancement:
                processing_filters.extend([
                    "acompressor=threshold=0.12:ratio=3:attack=20:release=250",
                    "loudnorm=I=-16:LRA=11:TP=-1.5",
                ])
            if clip.audio.mute:
                processing_filters.append("volume=0.000")
            elif self._has_keyframes(clip, "volume"):
                volume_expr = self._keyframe_expr(clip, "volume", clip.audio.volume, scale=0.01, time_var="t")
                processing_filters.append(f"volume='{volume_expr}':eval=frame")
            else:
                processing_filters.append(f"volume={effective_volume:.3f}")
            filter_complex.append(f"[{in_idx}:a]{','.join(processing_filters)}[{node_prefix}_v]")
            fade_node = f"{node_prefix}_v"
            if clip.audio.fadeIn > 0:
                fade_in_curve = curve_map.get(clip.audio.fadeInCurve, "tri")
                filter_complex.append(
                    f"[{fade_node}]afade=t=in:st=0:d={clip.audio.fadeIn:.2f}:curve={fade_in_curve}[{node_prefix}_fi]"
                )
                fade_node = f"{node_prefix}_fi"
            if clip.audio.fadeOut > 0:
                fade_out_start = max(0, clip.duration - clip.audio.fadeOut)
                fade_out_curve = curve_map.get(clip.audio.fadeOutCurve, "tri")
                filter_complex.append(
                    f"[{fade_node}]afade=t=out:st={fade_out_start:.2f}:d={clip.audio.fadeOut:.2f}:curve={fade_out_curve}[{node_prefix}_fo]"
                )
                fade_node = f"{node_prefix}_fo"
            delay_ms = int(clip.start_time * 1000)
            filter_complex.append(
                f"[{fade_node}]adelay={delay_ms}|{delay_ms}[{node_prefix}_out]"
            )
            output_node = f"{node_prefix}_out"
            if clip.audio.duckingRole == "bed" and clip.audio.autoDucking and narration_ranges:
                overlap_expr = "+".join(
                    f"between(t,{start:.3f},{end:.3f})"
                    for start, end in narration_ranges
                )
                filter_complex.append(
                    f"[{output_node}]volume='if(gt({overlap_expr},0),0.42,1)'[{node_prefix}_duck]"
                )
                output_node = f"{node_prefix}_duck"
            audio_outs.append(f"[{output_node}]")

        # 1a. Explicit audio-track clips
        for track in blueprint.tracks:
            if track.type == "audio":
                for i, clip in enumerate(track.clips):
                    in_idx = input_idx_map.get(clip.file_id)
                    if in_idx is None:
                        logger.warning(f"Audio clip {clip.file_id} not found in file_paths, skipping")
                        continue
                    process_audio_clip(clip, f"a_{track.id}_{i}", in_idx)

        # 1b. Embedded audio from VIDEO clips on visual tracks
        #     We detect video by running ffprobe on the actual saved file
        for track in blueprint.tracks:
            if track.type == "visual":
                for i, clip in enumerate(track.clips):
                    in_idx = input_idx_map.get(clip.file_id)
                    if in_idx is None:
                        logger.warning(f"Visual clip {clip.file_id} not found in file_paths, skipping")
                        continue
                    path = file_paths.get(clip.file_id, "")
                    # Detect if this input actually has an audio stream via ffprobe
                    probe = subprocess.run(
                        ["ffprobe", "-v", "error", "-select_streams", "a:0",
                         "-show_entries", "stream=codec_type", "-of", "csv", path],
                        capture_output=True, text=True
                    )
                    has_audio = "audio" in probe.stdout
                    logger.info(f"Visual clip {clip.file_id}: has_audio={has_audio} (probe: {probe.stdout.strip()!r})")
                    if not has_audio:
                        continue
                    process_audio_clip(clip, f"va_{track.id}_{i}", in_idx)

        if audio_outs:
            logger.info(f"Mixing {len(audio_outs)} audio streams: {audio_outs}")
            filter_complex.append(
                f"{''.join(audio_outs)}amix=inputs={len(audio_outs)}:duration=longest:normalize=0[audio_final]"
            )
        else:
            logger.info("No audio streams found, generating silence")
            filter_complex.append(
                f"anullsrc=r=48000:cl=stereo:d={total_duration}[audio_final]"
            )

        # ─── Visual Processing ─────────────────────────────────────────────
        visual_clips = []
        text_clips = []
        for track in blueprint.tracks:
            if track.type == "visual" and not blueprint.audio_only:
                for clip in track.clips:
                    visual_clips.append(clip)
            if track.type == "text" and not blueprint.audio_only:
                for clip in track.clips:
                    if clip.text:
                        text_clips.append(clip)
        visual_clips.sort(key=lambda c: c.start_time)

        should_render_video = bool(visual_clips or text_clips)

        if should_render_video:
            filter_complex.append(
                f"color=c=black:s={blueprint.width}x{blueprint.height}:r={blueprint.fps}:d={total_duration}[base]"
            )
            last_out = "base"

            for i, clip in enumerate(visual_clips):
                in_idx = input_idx_map[clip.file_id]

                # 1. Trim, retime, crop, then fit inside the canvas.
                source_duration = max(0.033, clip.duration * max(0.25, min(4.0, clip.speed.rate)))
                timing_filters = []
                if clip.speed.freezeFrame:
                    timing_filters.append(f"trim=start={clip.in_point}:duration=0.033")
                    timing_filters.append("setpts=PTS-STARTPTS")
                    timing_filters.append(f"tpad=stop_mode=clone:stop_duration={clip.duration:.3f}")
                else:
                    timing_filters.append(f"trim=start={clip.in_point}:duration={source_duration:.3f}")
                    if clip.speed.reverse:
                        timing_filters.append("reverse")
                    timing_filters.append(f"setpts=PTS/{max(0.25, min(4.0, clip.speed.rate)):.3f}")

                crop_left = max(0.0, min(0.45, clip.crop.left / 100.0))
                crop_right = max(0.0, min(0.45, clip.crop.right / 100.0))
                crop_top = max(0.0, min(0.45, clip.crop.top / 100.0))
                crop_bottom = max(0.0, min(0.45, clip.crop.bottom / 100.0))
                if any(value > 0 for value in (crop_left, crop_right, crop_top, crop_bottom)):
                    timing_filters.append(
                        "crop="
                        f"iw*{1 - crop_left - crop_right:.4f}:"
                        f"ih*{1 - crop_top - crop_bottom:.4f}:"
                        f"iw*{crop_left:.4f}:"
                        f"ih*{crop_top:.4f}"
                    )

                timing_filters.append(
                    f"scale=w='min({blueprint.width}/iw,{blueprint.height}/ih)*iw':"
                    f"h='min({blueprint.width}/iw,{blueprint.height}/ih)*ih'"
                )
                timing_filters.append("setsar=1")
                filter_complex.append(f"[{in_idx}:v]{','.join(timing_filters)}[v_base_{i}]")

                # 2. Transforms (flip, rotate, zoom, animated opacity)
                out_node = f"v_base_{i}"
                tf_filters = []
                if clip.transform.flipX:
                    tf_filters.append("hflip")
                if clip.transform.flipY:
                    tf_filters.append("vflip")
                if tf_filters:
                    filter_complex.append(f"[{out_node}]{','.join(tf_filters)}[v_tf_{i}]")
                    out_node = f"v_tf_{i}"

                rotation_expr = self._keyframe_expr(clip, "rotation", clip.transform.rotation, time_var="t")
                if clip.transform.rotation != 0 or self._has_keyframes(clip, "rotation"):
                    filter_complex.append(
                        f"[{out_node}]"
                        f"rotate='{rotation_expr}*PI/180':c=black@0:ow='max(iw,ih)':oh='max(iw,ih)'"
                        f"[v_rot_{i}]"
                    )
                    out_node = f"v_rot_{i}"

                scale_expr = self._keyframe_expr(clip, "scale", clip.transform.scale, scale=0.01, time_var="t")
                if clip.transform.scale != 100 or self._has_keyframes(clip, "scale"):
                    filter_complex.append(
                        f"[{out_node}]scale=w='iw*({scale_expr})':h='ih*({scale_expr})':eval=frame[v_scale_{i}]"
                    )
                    out_node = f"v_scale_{i}"

                opacity = max(0.0, min(1.0, clip.transform.opacity / 100.0))
                if self._has_keyframes(clip, "opacity"):
                    opacity_expr = self._keyframe_expr(clip, "opacity", clip.transform.opacity, scale=0.01, time_var="T")
                    filter_complex.append(
                        f"[{out_node}]format=rgba,"
                        f"geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='alpha(X,Y)*({opacity_expr})'"
                        f"[v_opacity_{i}]"
                    )
                    out_node = f"v_opacity_{i}"
                elif opacity < 1.0:
                    filter_complex.append(
                        f"[{out_node}]format=rgba,colorchannelmixer=aa={opacity:.3f}[v_opacity_{i}]"
                    )
                    out_node = f"v_opacity_{i}"

                # 3. Color grading
                br = (clip.color.brightness / 100.0) - 1.0
                con = clip.color.contrast / 100.0
                sat = clip.color.saturation / 100.0
                br += clip.color.exposure / 100.0
                br = max(-1.0, min(1.0, br))

                color_filters = []
                if clip.color.brightness != 100 or clip.color.contrast != 100 or \
                   clip.color.saturation != 100 or clip.color.exposure != 0:
                    color_filters.append(f"eq=brightness={br:.3f}:contrast={con:.3f}:saturation={sat:.3f}")

                if clip.color.temperature != 0:
                    t = clip.color.temperature / 100.0
                    rs, bs = t * 0.15, -t * 0.15
                    color_filters.append(
                        f"colorbalance=rs={rs:.3f}:gs=0:bs={bs:.3f}"
                        f":rm={rs:.3f}:gm=0:bm={bs:.3f}"
                        f":rh={rs:.3f}:gh=0:bh={bs:.3f}"
                    )

                if any(value != 0 for value in (clip.color.red, clip.color.green, clip.color.blue)):
                    rs = max(-1.0, min(1.0, clip.color.red / 100.0))
                    gs = max(-1.0, min(1.0, clip.color.green / 100.0))
                    bs = max(-1.0, min(1.0, clip.color.blue / 100.0))
                    color_filters.append(
                        f"colorbalance=rs={rs:.3f}:gs={gs:.3f}:bs={bs:.3f}"
                        f":rm={rs:.3f}:gm={gs:.3f}:bm={bs:.3f}"
                        f":rh={rs:.3f}:gh={gs:.3f}:bh={bs:.3f}"
                    )

                if clip.color.highlights != 0 or clip.color.shadows != 0:
                    shadow_gain = max(0.0, min(2.0, 1 + clip.color.shadows / 200.0))
                    highlight_gain = max(0.0, min(2.0, 1 + clip.color.highlights / 200.0))
                    color_filters.append(
                        f"colorlevels=rimin=0:gimin=0:bimin=0:rimax={highlight_gain:.3f}:"
                        f"gimax={highlight_gain:.3f}:bimax={highlight_gain:.3f}:"
                        f"romin=0:gomin=0:bomin=0:romax={shadow_gain:.3f}:"
                        f"gomax={shadow_gain:.3f}:bomax={shadow_gain:.3f}"
                    )

                if clip.effects.blur > 0:
                    color_filters.append(f"gblur=sigma={clip.effects.blur:.3f}")

                if clip.effects.sharpen > 0:
                    sharpen = max(0.0, min(5.0, clip.effects.sharpen / 20.0))
                    color_filters.append(f"unsharp=5:5:{sharpen:.3f}:5:5:0")

                if clip.effects.vignette > 0:
                    angle = max(0.0, min(math.pi / 2, (clip.effects.vignette / 100.0) * (math.pi / 2)))
                    color_filters.append(f"vignette=angle={angle:.3f}")

                if clip.effects.clarity != 0:
                    clarity = max(-0.5, min(0.5, clip.effects.clarity / 200.0))
                    color_filters.append(f"eq=contrast={1 + clarity:.3f}")

                if clip.compositing.stabilization:
                    color_filters.append("deshake")

                if clip.compositing.chromaKeyEnabled:
                    similarity = max(0.01, min(1.0, clip.compositing.chromaKeySimilarity))
                    blend = max(0.0, min(1.0, max(clip.compositing.edgeFeather, clip.compositing.spillSuppression)))
                    color_filters.append(
                        f"colorkey={clip.compositing.chromaKeyColor}:{similarity:.3f}:{blend:.3f}"
                    )

                if clip.compositing.borderWidth > 0:
                    color_filters.append(
                        f"drawbox=x=0:y=0:w=iw:h=ih:color={clip.compositing.borderColor}:t={clip.compositing.borderWidth:.1f}"
                    )

                if color_filters:
                    filter_complex.append(f"[{out_node}]{','.join(color_filters)}[v_color_{i}]")
                    out_node = f"v_color_{i}"

                transition_duration = max(0.0, min(clip.duration / 2, clip.transition.duration))
                if transition_duration > 0 and clip.transition.type in {"fade", "crossfade"}:
                    filter_complex.append(
                        f"[{out_node}]format=rgba,"
                        f"fade=t=in:st=0:d={transition_duration:.3f}:alpha=1[v_fade_in_{i}]"
                    )
                    out_node = f"v_fade_in_{i}"
                    if clip.transition.type == "fade":
                        fade_out_start = max(0.0, clip.duration - transition_duration)
                        filter_complex.append(
                            f"[{out_node}]"
                            f"fade=t=out:st={fade_out_start:.3f}:d={transition_duration:.3f}:alpha=1[v_fade_out_{i}]"
                        )
                        out_node = f"v_fade_out_{i}"

                # Overlay onto canvas
                next_out = f"base_{i+1}"
                local_t = f"(t-{clip.start_time:.6f})"
                overlay_x = self._keyframe_expr(clip, "x", clip.transform.x, scale=0.01, time_var=local_t)
                overlay_y = self._keyframe_expr(clip, "y", clip.transform.y, scale=0.01, time_var=local_t)
                filter_complex.append(
                    f"[{last_out}][{out_node}]"
                    f"overlay=x='({blueprint.width}-w)*({overlay_x})':"
                    f"y='({blueprint.height}-h)*({overlay_y})':"
                    f"enable='between(t,{clip.start_time},{clip.start_time + clip.duration})'"
                    f"[{next_out}]"
                )
                last_out = next_out

            # ── Text Overlays ─────────────────────────────────────────────
            # Render text to transparent PNGs with Pillow, then composite the
            # PNGs in FFmpeg. This works even when FFmpeg lacks drawtext.
            text_counter = 0
            for clip in text_clips:
                td = clip.text
                overlay_path = self._render_text_overlay(td, blueprint, output_path, text_counter)
                text_overlay_paths.append(overlay_path)
                cmd.extend(["-loop", "1", "-t", f"{total_duration:.3f}", "-i", overlay_path])
                overlay_input_idx = idx
                idx += 1

                overlay_src = f"text_src_{text_counter}"
                next_text_out = f"text_{text_counter}"
                filter_complex.append(
                    f"[{overlay_input_idx}:v]format=rgba[{overlay_src}]"
                )
                filter_complex.append(
                    f"[{last_out}][{overlay_src}]"
                    f"overlay=0:0:enable='between(t,{clip.start_time},{clip.start_time + clip.duration})'"
                    f"[{next_text_out}]"
                )
                last_out = next_text_out
                text_counter += 1

            filter_complex.append(f"[{last_out}]format=yuv420p[video_final]")

        else:
            # No visuals — audio-only export
            pass

        # ─── Final Command ─────────────────────────────────────────────────
        cmd.extend(["-filter_complex", ";".join(filter_complex)])

        if should_render_video:
            cmd.extend([
                "-map", "[video_final]",
                "-map", "[audio_final]",
                "-c:v", "libx264",
                "-preset", "fast",
                "-c:a", "aac",
                "-b:a", "192k"
            ])
            if blueprint.video_bitrate_mbps:
                cmd.extend(["-b:v", f"{blueprint.video_bitrate_mbps}M"])
            else:
                cmd.extend(["-crf", str(blueprint.crf)])
        else:
            cmd.extend(["-map", "[audio_final]", "-c:a", "libmp3lame"])

        cmd.append(output_path)

        logger.info(f"=== FFmpeg filter_complex:\n" + "\n".join(f"  [{i}] {f}" for i, f in enumerate(filter_complex)))
        logger.info(f"=== Requested acceleration mode: {blueprint.hardware_acceleration}")
        logger.info(f"=== FFmpeg full command: {' '.join(cmd)}")
        try:
            result = subprocess.run(cmd, capture_output=True, text=True)
        finally:
            for path in text_overlay_paths:
                try:
                    os.remove(path)
                except FileNotFoundError:
                    pass

        if result.returncode != 0:
            logger.error(f"FFmpeg stderr:\n{result.stderr}")
            raise RuntimeError(f"Media compilation failed: {result.stderr}")
