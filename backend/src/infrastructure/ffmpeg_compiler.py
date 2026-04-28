import subprocess
import logging
from typing import Dict
from backend.src.domain.interfaces.media_compiler import IMediaCompiler
from backend.src.domain.models.blueprint import TimelineBlueprint

logger = logging.getLogger(__name__)

class FFmpegMediaCompiler(IMediaCompiler):
    def compile_sequence(self, blueprint: TimelineBlueprint, file_paths: Dict[str, str], output_path: str) -> None:
        cmd = ["ffmpeg", "-y"]
        
        # 1. Map input files to indices
        input_idx_map = {}
        idx = 0
        for file_id, path in file_paths.items():
            cmd.extend(["-i", path])
            input_idx_map[file_id] = idx
            idx += 1
            
        filter_complex = []
        
        # Determine total duration
        total_duration = 0.0
        for track in blueprint.tracks:
            for clip in track.clips:
                total_duration = max(total_duration, clip.start_time + clip.duration)
                
        if total_duration == 0:
            raise ValueError("Sequence duration is 0")

        # --- Audio Processing ---
        audio_outs = []
        for track in blueprint.tracks:
            if track.type == "audio":
                for i, clip in enumerate(track.clips):
                    in_idx = input_idx_map[clip.file_id]
                    node_name = f"a_{track.id}_{i}"
                    
                    # Trim, reset timestamps, volume
                    filter_complex.append(
                        f"[{in_idx}:a]atrim=start={clip.in_point}:duration={clip.duration},"
                        f"asetpts=PTS-STARTPTS,volume={clip.volume}[{node_name}_t]"
                    )
                    
                    # Delay to start_time
                    delay_ms = int(clip.start_time * 1000)
                    filter_complex.append(
                        f"[{node_name}_t]adelay={delay_ms}|{delay_ms}[{node_name}_out]"
                    )
                    audio_outs.append(f"[{node_name}_out]")

        if audio_outs:
            filter_complex.append(f"{''.join(audio_outs)}amix=inputs={len(audio_outs)}:duration=longest[audio_final]")
        else:
            # Create silent audio if no audio tracks
            filter_complex.append(f"anullsrc=r=48000:cl=stereo:d={total_duration}[audio_final]")

        # --- Visual Processing ---
        visual_clips = []
        for track in blueprint.tracks:
            if track.type == "visual":
                for clip in track.clips:
                    visual_clips.append(clip)
        
        # Sort visual clips by start time to overlay them correctly
        visual_clips.sort(key=lambda c: c.start_time)

        if visual_clips:
            # Create base black canvas
            filter_complex.append(f"color=c=black:s={blueprint.width}x{blueprint.height}:r={blueprint.fps}:d={total_duration}[base]")
            
            last_out = "base"
            for i, clip in enumerate(visual_clips):
                in_idx = input_idx_map[clip.file_id]
                node_name = f"v_{i}"
                
                # If image, we need to loop it. If video, we trim it.
                # Since we don't know file type easily here, we'll try to apply both logic safely 
                # or assume frontend passes correct durations.
                
                # 1. Trim, reset pts, and fit to base canvas size
                filter_complex.append(
                    f"[{in_idx}:v]trim=start={clip.in_point}:duration={clip.duration},"
                    f"setpts=PTS-STARTPTS,"
                    f"scale={blueprint.width}:{blueprint.height}:force_original_aspect_ratio=decrease,"
                    f"pad={blueprint.width}:{blueprint.height}:(ow-iw)/2:(oh-ih)/2,"
                    f"setsar=1[v_base_{i}]"
                )
                
                # 2. Apply User Transforms (Flip, Rotate, Scale/Zoom)
                tf_filters = []
                if clip.transform.flipX:
                    tf_filters.append("hflip")
                if clip.transform.flipY:
                    tf_filters.append("vflip")
                if clip.transform.rotation != 0:
                    tf_filters.append(f"rotate={clip.transform.rotation}*PI/180:c=black@0:ow='max(iw,ih)':oh='max(iw,ih)'")
                
                scale_factor = clip.transform.scale / 100.0
                if scale_factor != 1.0 or clip.transform.rotation != 0:
                    tf_filters.append(f"scale=iw*{scale_factor}:ih*{scale_factor}")
                    # After zooming or rotating, we must crop back to the canvas size
                    tf_filters.append(f"crop={blueprint.width}:{blueprint.height}")
                
                out_node = f"v_base_{i}"
                if tf_filters:
                    filter_complex.append(f"[{out_node}]{','.join(tf_filters)}[v_tf_{i}]")
                    out_node = f"v_tf_{i}"
                
                # Overlay at start_time
                next_out = f"base_{i+1}"
                filter_complex.append(
                    f"[{last_out}][{out_node}]overlay=enable='between(t,{clip.start_time},{clip.start_time+clip.duration})'[ {next_out}]"
                )
                last_out = next_out
            
            filter_complex.append(f"[{last_out}]format=yuv420p[video_final]")
        else:
            # If no visuals, we only export audio. But if video format requested, we could make black screen.
            pass

        # Build final command
        cmd.extend(["-filter_complex", ";".join(filter_complex)])
        
        if visual_clips:
            cmd.extend(["-map", "[video_final]", "-map", "[audio_final]", "-c:v", "libx264", "-c:a", "aac"])
        else:
            cmd.extend(["-map", "[audio_final]", "-c:a", "libmp3lame"])
            
        cmd.append(output_path)
        
        logger.info(f"Executing FFmpeg Compiler: {' '.join(cmd)}")
        result = subprocess.run(cmd, capture_output=True, text=True)
        
        if result.returncode != 0:
            logger.error(f"FFmpeg Compiler Error: {result.stderr}")
            raise RuntimeError(f"Media compilation failed: {result.stderr}")
