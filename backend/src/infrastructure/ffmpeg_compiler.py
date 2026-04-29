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
        from PIL import Image, ImageColor, ImageDraw, ImageFont
        return Image, ImageColor, ImageDraw, ImageFont
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


def _wrap_text(draw, text: str, font, max_width: int) -> list[str]:
    wrapped: list[str] = []
    for raw_line in text.splitlines() or [""]:
        words = raw_line.split(" ")
        line = ""
        for word in words:
            candidate = word if not line else f"{line} {word}"
            bbox = draw.textbbox((0, 0), candidate, font=font)
            if bbox[2] - bbox[0] <= max_width or not line:
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
    def _render_text_overlay(self, td, blueprint: TimelineBlueprint, output_path: str, index: int) -> str:
        Image, ImageColor, ImageDraw, ImageFont = _load_pillow()

        width, height = blueprint.width, blueprint.height
        image = Image.new("RGBA", (width, height), (0, 0, 0, 0))
        draw = ImageDraw.Draw(image)

        font_path = _font_path(td.fontFamily, td.bold, td.italic)
        try:
            font = ImageFont.truetype(font_path, td.fontSize) if font_path else ImageFont.load_default()
        except Exception:
            logger.warning("Failed to load font %s, using Pillow default", font_path)
            font = ImageFont.load_default()

        max_text_width = int(width * 0.9)
        lines = _wrap_text(draw, td.content, font, max_text_width)
        spacing = max(4, int(td.fontSize * 0.2))
        line_boxes = [draw.textbbox((0, 0), line or " ", font=font) for line in lines]
        line_widths = [box[2] - box[0] for box in line_boxes]
        line_heights = [box[3] - box[1] for box in line_boxes]
        text_width = min(max(line_widths or [0]), max_text_width)
        text_height = sum(line_heights) + spacing * max(0, len(lines) - 1)

        pad_x = int(td.fontSize * 0.4) if td.bgOpacity > 0 else 0
        pad_y = int(td.fontSize * 0.2) if td.bgOpacity > 0 else 0
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
                radius=max(4, math.ceil(td.fontSize * 0.1)),
                fill=bg,
            )

        text_color = _hex_to_rgba(ImageColor, td.color, 1.0)
        y = top + pad_y
        for line, line_width, line_height in zip(lines, line_widths, line_heights):
            if td.align == "left":
                x = left + pad_x
            elif td.align == "right":
                x = left + box_width - pad_x - line_width
            else:
                x = left + (box_width - line_width) / 2

            # Subtle shadow when no background is present, matching the browser preview.
            if td.bgOpacity == 0:
                draw.text((x + 2, y + 2), line, font=font, fill=(0, 0, 0, 190))
            draw.text((x, y), line, font=font, fill=text_color)
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

        def process_audio_clip(clip, node_prefix: str, in_idx: int) -> None:
            """Extract, volume-adjust, fade, and delay an audio clip into audio_outs."""
            effective_volume = 0.0 if clip.audio.mute else (clip.audio.volume / 100.0)

            filter_complex.append(
                f"[{in_idx}:a]atrim=start={clip.in_point}:duration={clip.duration},"
                f"asetpts=PTS-STARTPTS,volume={effective_volume:.3f}[{node_prefix}_v]"
            )
            fade_node = f"{node_prefix}_v"
            if clip.audio.fadeIn > 0:
                filter_complex.append(
                    f"[{fade_node}]afade=t=in:st=0:d={clip.audio.fadeIn:.2f}[{node_prefix}_fi]"
                )
                fade_node = f"{node_prefix}_fi"
            if clip.audio.fadeOut > 0:
                fade_out_start = max(0, clip.duration - clip.audio.fadeOut)
                filter_complex.append(
                    f"[{fade_node}]afade=t=out:st={fade_out_start:.2f}:d={clip.audio.fadeOut:.2f}[{node_prefix}_fo]"
                )
                fade_node = f"{node_prefix}_fo"
            delay_ms = int(clip.start_time * 1000)
            filter_complex.append(
                f"[{fade_node}]adelay={delay_ms}|{delay_ms}[{node_prefix}_out]"
            )
            audio_outs.append(f"[{node_prefix}_out]")

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
        for track in blueprint.tracks:
            if track.type == "visual" and not blueprint.audio_only:
                for clip in track.clips:
                    visual_clips.append(clip)
        visual_clips.sort(key=lambda c: c.start_time)

        if visual_clips:
            filter_complex.append(
                f"color=c=black:s={blueprint.width}x{blueprint.height}:r={blueprint.fps}:d={total_duration}[base]"
            )
            last_out = "base"

            for i, clip in enumerate(visual_clips):
                in_idx = input_idx_map[clip.file_id]

                # 1. Trim, fit to canvas
                filter_complex.append(
                    f"[{in_idx}:v]trim=start={clip.in_point}:duration={clip.duration},"
                    f"setpts=PTS-STARTPTS,"
                    f"scale={blueprint.width}:{blueprint.height}:force_original_aspect_ratio=decrease,"
                    f"pad={blueprint.width}:{blueprint.height}:(ow-iw)/2:(oh-ih)/2,"
                    f"setsar=1[v_base_{i}]"
                )

                # 2. Transforms (flip, rotate, zoom)
                tf_filters = []
                if clip.transform.flipX:
                    tf_filters.append("hflip")
                if clip.transform.flipY:
                    tf_filters.append("vflip")
                if clip.transform.rotation != 0:
                    tf_filters.append(
                        f"rotate={clip.transform.rotation}*PI/180:c=black@0"
                        f":ow='max(iw,ih)':oh='max(iw,ih)'"
                    )
                scale_factor = clip.transform.scale / 100.0
                if scale_factor != 1.0 or clip.transform.rotation != 0:
                    tf_filters.append(f"scale=iw*{scale_factor}:ih*{scale_factor}")
                    tf_filters.append(f"crop={blueprint.width}:{blueprint.height}")

                out_node = f"v_base_{i}"
                if tf_filters:
                    filter_complex.append(f"[{out_node}]{','.join(tf_filters)}[v_tf_{i}]")
                    out_node = f"v_tf_{i}"

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

                if color_filters:
                    filter_complex.append(f"[{out_node}]{','.join(color_filters)}[v_color_{i}]")
                    out_node = f"v_color_{i}"

                # Overlay onto canvas
                next_out = f"base_{i+1}"
                filter_complex.append(
                    f"[{last_out}][{out_node}]"
                    f"overlay=enable='between(t,{clip.start_time},{clip.start_time + clip.duration})'"
                    f"[{next_out}]"
                )
                last_out = next_out

            # ── Text Overlays ─────────────────────────────────────────────
            # Render text to transparent PNGs with Pillow, then composite the
            # PNGs in FFmpeg. This works even when FFmpeg lacks drawtext.
            text_counter = 0
            for track in blueprint.tracks:
                if track.type == "text":
                    for clip in track.clips:
                        if not clip.text:
                            continue
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

        if visual_clips:
            cmd.extend([
                "-map", "[video_final]",
                "-map", "[audio_final]",
                "-c:v", "libx264",
                "-crf", str(blueprint.crf),
                "-preset", "fast",
                "-c:a", "aac",
                "-b:a", "192k"
            ])
        else:
            cmd.extend(["-map", "[audio_final]", "-c:a", "libmp3lame"])

        cmd.append(output_path)

        logger.info(f"=== FFmpeg filter_complex:\n" + "\n".join(f"  [{i}] {f}" for i, f in enumerate(filter_complex)))
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
