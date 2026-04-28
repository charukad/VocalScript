from typing import List
import subprocess
import logging
import os

logger = logging.getLogger(__name__)

class AudioMergerService:
    @staticmethod
    def merge_audio_files(file_paths: List[str], output_path: str) -> str:
        """
        Merges multiple audio files sequentially using ffmpeg directly.
        """
        if not file_paths:
            raise ValueError("No audio files provided for merging.")
            
        logger.info(f"Merging {len(file_paths)} audio files using ffmpeg...")
        
        if len(file_paths) == 1:
            # Just convert the single file to mp3
            cmd = ["ffmpeg", "-y", "-i", file_paths[0], output_path]
            subprocess.run(cmd, check=True, capture_output=True)
            return output_path
            
        # For multiple files, we use the concat filter
        cmd = ["ffmpeg", "-y"]
        for fp in file_paths:
            cmd.extend(["-i", fp])
            
        # Build the filter_complex string
        # e.g. "[0:a][1:a]concat=n=2:v=0:a=1[out]"
        filter_str = "".join([f"[{i}:a]" for i in range(len(file_paths))])
        filter_str += f"concat=n={len(file_paths)}:v=0:a=1[out]"
        
        cmd.extend(["-filter_complex", filter_str, "-map", "[out]", output_path])
        
        try:
            logger.info(f"Running ffmpeg command: {' '.join(cmd)}")
            subprocess.run(cmd, check=True, capture_output=True)
            logger.info("Merging complete.")
            return output_path
        except subprocess.CalledProcessError as e:
            logger.error(f"FFmpeg error: {e.stderr.decode('utf-8', errors='ignore')}")
            raise RuntimeError("Failed to merge audio files")
