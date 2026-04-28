from typing import List, Optional
import subprocess
import logging
import os

logger = logging.getLogger(__name__)

class MediaMergerService:
    @staticmethod
    def process_media(audio_paths: List[str], visual_path: Optional[str], output_path: str) -> str:
        """
        Merges audio files and optionally combines them with a visual file (image/video).
        """
        if not audio_paths:
            raise ValueError("At least one audio file must be provided.")
            
        logger.info(f"Processing {len(audio_paths)} audio files and visual_path={visual_path}...")
        
        # 1. Merge audio files into a single temporary audio track
        temp_audio = output_path + ".temp.mp3"
        
        if len(audio_paths) == 1:
            cmd_audio = ["ffmpeg", "-y", "-i", audio_paths[0], temp_audio]
        else:
            cmd_audio = ["ffmpeg", "-y"]
            for fp in audio_paths:
                cmd_audio.extend(["-i", fp])
            
            filter_str = "".join([f"[{i}:a]" for i in range(len(audio_paths))])
            filter_str += f"concat=n={len(audio_paths)}:v=0:a=1[out]"
            cmd_audio.extend(["-filter_complex", filter_str, "-map", "[out]", temp_audio])
            
        try:
            logger.info("Merging audio tracks...")
            subprocess.run(cmd_audio, check=True, capture_output=True)
        except subprocess.CalledProcessError as e:
            logger.error(f"FFmpeg audio merge error: {e.stderr.decode('utf-8', errors='ignore')}")
            raise RuntimeError("Failed to merge audio files")

        # 2. If no visual file, the temp audio is our final output
        if not visual_path:
            os.rename(temp_audio, output_path)
            return output_path
            
        # 3. Handle visual file
        ext = os.path.splitext(visual_path)[1].lower()
        is_image = ext in ['.jpg', '.jpeg', '.png', '.webp']
        
        cmd_final = ["ffmpeg", "-y"]
        
        if is_image:
            # Loop image, add merged audio, stop at shortest (which is the audio)
            cmd_final.extend([
                "-loop", "1",
                "-framerate", "2", # low framerate for static image
                "-i", visual_path,
                "-i", temp_audio,
                "-c:v", "libx264",
                "-tune", "stillimage",
                "-c:a", "aac",
                "-b:a", "192k",
                "-pix_fmt", "yuv420p",
                "-shortest",
                output_path
            ])
        else:
            # It's a video. Remove original audio, add our merged audio, stop at shortest.
            cmd_final.extend([
                "-i", visual_path,
                "-i", temp_audio,
                "-c:v", "copy",     # Copy video stream to avoid re-encoding
                "-c:a", "aac",      # Encode audio to standard AAC
                "-map", "0:v:0",    # Take first video stream from first input
                "-map", "1:a:0",    # Take first audio stream from second input
                "-shortest",
                output_path
            ])
            
        try:
            logger.info(f"Merging visual with audio: {' '.join(cmd_final)}")
            subprocess.run(cmd_final, check=True, capture_output=True)
            logger.info("Visual merge complete.")
        except subprocess.CalledProcessError as e:
            logger.error(f"FFmpeg visual merge error: {e.stderr.decode('utf-8', errors='ignore')}")
            raise RuntimeError("Failed to merge visual and audio files")
        finally:
            if os.path.exists(temp_audio):
                os.remove(temp_audio)
                
        return output_path
