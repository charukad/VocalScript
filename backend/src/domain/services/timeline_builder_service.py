from typing import Dict, List, Optional

from backend.src.domain.models.content_studio import NarrationLine, ScriptDetail
from backend.src.domain.models.generation import GeneratedMediaAsset, StoryboardScene
from backend.src.domain.models.timeline_builder import (
    TimelineDraft,
    TimelineDraftAudioClip,
    TimelineDraftCaptionClip,
    TimelineDraftVisualClip,
)


WORDS_PER_SECOND = 2.6
MIN_LINE_DURATION_SECONDS = 1.0


class TimelineBuilderService:
    def build_draft(
        self,
        script: ScriptDetail,
        scenes: List[StoryboardScene],
        generated_media_assets: List[GeneratedMediaAsset],
    ) -> TimelineDraft:
        narration_lines = sorted(script.narration_lines, key=lambda line: line.index)
        audio_clips = self._build_audio_clips(narration_lines)
        visual_clips = self._build_visual_clips(scenes, generated_media_assets)
        caption_clips = self._build_caption_clips(audio_clips)
        duration = max(
            [clip.end for clip in audio_clips]
            + [clip.end for clip in visual_clips]
            + [0.0]
        )
        warnings = self._build_warnings(narration_lines, audio_clips, visual_clips)
        return TimelineDraft(
            scriptId=script.id,
            estimatedDurationSeconds=round(duration, 3),
            audioClips=audio_clips,
            visualClips=visual_clips,
            captionClips=caption_clips,
            warnings=warnings,
        )

    def _build_audio_clips(self, narration_lines: List[NarrationLine]) -> List[TimelineDraftAudioClip]:
        clips: List[TimelineDraftAudioClip] = []
        cursor = 0.0
        for line in narration_lines:
            duration = self._line_duration(line)
            source_job_id = self._job_id_from_audio_asset(line.audio_asset_id)
            clips.append(
                TimelineDraftAudioClip(
                    narrationLineId=line.id,
                    sourceJobId=source_job_id,
                    audioAssetId=line.audio_asset_id,
                    text=line.text,
                    start=round(cursor, 3),
                    end=round(cursor + duration, 3),
                    duration=round(duration, 3),
                    assetAvailable=bool(line.audio_asset_id),
                )
            )
            cursor += duration + max(0.0, line.pause_after_seconds or 0.0)
        return clips

    def _build_visual_clips(
        self,
        scenes: List[StoryboardScene],
        generated_media_assets: List[GeneratedMediaAsset],
    ) -> List[TimelineDraftVisualClip]:
        asset_by_scene = self._latest_completed_asset_by_scene(generated_media_assets)
        clips: List[TimelineDraftVisualClip] = []
        for scene in sorted(scenes, key=lambda item: (item.start, item.end, item.id)):
            asset = asset_by_scene.get(scene.id)
            duration = max(0.1, scene.end - scene.start)
            clips.append(
                TimelineDraftVisualClip(
                    sceneId=scene.id,
                    sourceJobId=asset.job_id if asset else None,
                    text=scene.caption_text or scene.transcript,
                    start=round(scene.start, 3),
                    end=round(max(scene.start + 0.1, scene.end), 3),
                    duration=round(duration, 3),
                    assetAvailable=asset is not None,
                )
            )
        return clips

    def _build_caption_clips(self, audio_clips: List[TimelineDraftAudioClip]) -> List[TimelineDraftCaptionClip]:
        return [
            TimelineDraftCaptionClip(
                id=f"timeline-caption-{clip.narration_line_id}",
                sourceLineId=clip.narration_line_id,
                text=clip.text,
                start=clip.start,
                end=clip.end,
                duration=clip.duration,
            )
            for clip in audio_clips
            if clip.text.strip()
        ]

    def _build_warnings(
        self,
        narration_lines: List[NarrationLine],
        audio_clips: List[TimelineDraftAudioClip],
        visual_clips: List[TimelineDraftVisualClip],
    ) -> List[str]:
        warnings: List[str] = []
        if not narration_lines:
            warnings.append("No narration lines exist yet, so the draft cannot place audio or captions.")
        elif any(not clip.asset_available for clip in audio_clips):
            missing_audio = sum(1 for clip in audio_clips if not clip.asset_available)
            warnings.append(f"{missing_audio} narration line(s) do not have generated audio yet.")

        if not visual_clips:
            warnings.append("No storyboard scenes were provided, so the draft has no visual clips.")
        elif any(not clip.asset_available for clip in visual_clips):
            missing_visuals = sum(1 for clip in visual_clips if not clip.asset_available)
            warnings.append(f"{missing_visuals} storyboard scene(s) do not have generated media yet.")
        return warnings

    def _line_duration(self, line: NarrationLine) -> float:
        if line.duration_seconds and line.duration_seconds > 0:
            return line.duration_seconds
        words = len(line.text.split())
        return max(MIN_LINE_DURATION_SECONDS, words / WORDS_PER_SECOND)

    def _job_id_from_audio_asset(self, audio_asset_id: Optional[str]) -> Optional[str]:
        if not audio_asset_id or not audio_asset_id.startswith("generated-"):
            return None
        return audio_asset_id.removeprefix("generated-")

    def _latest_completed_asset_by_scene(
        self,
        generated_media_assets: List[GeneratedMediaAsset],
    ) -> Dict[str, GeneratedMediaAsset]:
        completed_assets = [
            asset
            for asset in generated_media_assets
            if asset.media_type in ("image", "video")
            and asset.status == "completed"
            and bool(asset.result_url or asset.local_path)
        ]
        by_scene: Dict[str, GeneratedMediaAsset] = {}
        for asset in completed_assets:
            by_scene[asset.scene_id] = asset
        return by_scene
