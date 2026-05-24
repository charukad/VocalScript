import tempfile
from io import BytesIO
import unittest
from pathlib import Path

from backend.src.domain.models.content_profile import ContentProfileCreateRequest
from backend.src.domain.models.content_studio import (
    ContentIdeaCreateRequest,
    ContentIdeaUpdateRequest,
    ContentTrendCreateRequest,
    ContentTrendUpdateRequest,
    NarrationLineCreateRequest,
    NarrationLineUpdateRequest,
    ScriptCreateRequest,
    ScriptSplitLinesRequest,
    ScriptUpdateRequest,
    ScriptVersionCreateRequest,
)
from backend.src.domain.models.generation import GeneratedMediaAsset, StoryboardScene
from backend.src.domain.services.content_profile_service import ContentProfileService
from backend.src.domain.services.content_studio_service import ContentStudioService
from backend.src.domain.services.generation_queue_service import GenerationQueueService
from backend.src.domain.services.sqlite_store import SQLiteStore
from backend.src.domain.services.timeline_builder_service import TimelineBuilderService


class ContentStudioTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)
        self.store = SQLiteStore(str(self.root / "registry.db"))
        self.profile_service = ContentProfileService(self.store)
        self.studio_service = ContentStudioService(self.store)
        self.queue_service = GenerationQueueService(str(self.root / "generated"))
        self.timeline_builder_service = TimelineBuilderService()
        self.profile = self.profile_service.create_profile(
            ContentProfileCreateRequest(name="Daily AI Facts", platforms=["youtube_shorts"])
        )

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def test_ideas_can_be_created_updated_and_archived(self) -> None:
        idea = self.studio_service.create_idea(
            self.profile.id,
            ContentIdeaCreateRequest(
                title="Three AI habits",
                platform="youtube_shorts",
                hook="Most beginners miss the third one.",
            ),
        )
        updated = self.studio_service.update_idea(
            idea.id,
            ContentIdeaUpdateRequest(status="selected", estimatedViralScore=81),
        )
        self.assertIsNotNone(updated)
        assert updated is not None
        self.assertEqual(updated.status, "selected")
        self.assertEqual(updated.estimated_viral_score, 81)
        self.assertEqual([item.id for item in self.studio_service.list_ideas(self.profile.id)], [idea.id])

        archived = self.studio_service.archive_idea(idea.id)
        self.assertIsNotNone(archived)
        self.assertEqual(self.studio_service.list_ideas(self.profile.id), [])
        self.assertEqual(
            [item.id for item in self.studio_service.list_ideas(self.profile.id, include_archived=True)],
            [idea.id],
        )

    def test_trends_can_be_created_suggested_updated_and_archived(self) -> None:
        trend = self.studio_service.create_trend(
            self.profile.id,
            ContentTrendCreateRequest(
                topic="AI classroom tools",
                platform="youtube_shorts",
                trendScore=77,
                suggestedHook="Teachers are using this faster than expected.",
            ),
        )
        suggestions = self.studio_service.suggest_trends(
            profile_id=self.profile.id,
            content_type=self.profile.content_type,
            target_audience=self.profile.target_audience,
            platforms=self.profile.platforms,
            hook_style=self.profile.hook_style,
        )
        self.assertEqual(len(suggestions), 3)
        self.assertTrue(all(item.source == "rule_based_fallback" for item in suggestions))

        updated = self.studio_service.update_trend(
            trend.id,
            ContentTrendUpdateRequest(status="selected", nicheRelevance=91),
        )
        self.assertIsNotNone(updated)
        assert updated is not None
        self.assertEqual(updated.status, "selected")
        self.assertEqual(updated.niche_relevance, 91)
        self.assertEqual(len(self.studio_service.list_trends(self.profile.id)), 4)

        archived = self.studio_service.archive_trend(trend.id)
        self.assertIsNotNone(archived)
        self.assertEqual(len(self.studio_service.list_trends(self.profile.id)), 3)
        self.assertEqual(len(self.studio_service.list_trends(self.profile.id, include_archived=True)), 4)

    def test_scripts_versions_and_narration_lines_persist(self) -> None:
        script = self.studio_service.create_script(
            self.profile.id,
            ScriptCreateRequest(
                title="AI facts draft",
                content="First line. Second line!\nThird line?",
            ),
        )
        self.assertEqual(len(script.versions), 1)

        versioned = self.studio_service.create_script_version(
            script.id,
            ScriptVersionCreateRequest(
                label="Punchier",
                content="Hook line. Fast middle. Strong payoff.",
                selectAsFinal=True,
            ),
        )
        self.assertIsNotNone(versioned)
        assert versioned is not None
        self.assertEqual(versioned.status, "final")
        self.assertEqual(versioned.final_version_id, versioned.versions[0].id)

        updated = self.studio_service.update_script(
            script.id,
            ScriptUpdateRequest(title="AI facts final", latestAnalysis={"score": 82}),
        )
        self.assertIsNotNone(updated)
        assert updated is not None
        self.assertEqual(updated.title, "AI facts final")
        self.assertEqual(updated.latest_analysis, {"score": 82})

        lines = self.studio_service.split_script_into_lines(script.id, ScriptSplitLinesRequest())
        self.assertIsNotNone(lines)
        assert lines is not None
        self.assertEqual([line.text for line in lines], ["Hook line.", "Fast middle.", "Strong payoff."])

        detail = self.studio_service.get_script_detail(script.id)
        self.assertIsNotNone(detail)
        assert detail is not None
        self.assertEqual(len(detail.versions), 2)
        self.assertEqual([line.index for line in detail.narration_lines], [0, 1, 2])
        self.assertEqual(detail.latest_analysis, {"score": 82})

    def test_narration_lines_can_be_created_updated_and_reset(self) -> None:
        script = self.studio_service.create_script(
            self.profile.id,
            ScriptCreateRequest(title="Voice draft", content="Opening line."),
        )
        line = self.studio_service.create_narration_line(
            script.id,
            NarrationLineCreateRequest(
                text="Custom line",
                voiceStyle="energetic narrator",
                emotion="curious",
            ),
        )
        self.assertIsNotNone(line)
        assert line is not None
        updated = self.studio_service.update_narration_line(
            line.id,
            NarrationLineUpdateRequest(status="done", audioAssetId="asset-1", durationSeconds=1.25),
        )
        self.assertIsNotNone(updated)
        assert updated is not None
        self.assertEqual(updated.status, "done")
        self.assertEqual(updated.audio_asset_id, "asset-1")

        reset = self.studio_service.regenerate_narration_line(line.id)
        self.assertIsNotNone(reset)
        assert reset is not None
        self.assertEqual(reset.status, "pending")
        self.assertIsNone(reset.audio_asset_id)
        self.assertIsNone(reset.duration_seconds)

    def test_voice_jobs_can_be_created_from_narration_lines(self) -> None:
        script = self.studio_service.create_script(
            self.profile.id,
            ScriptCreateRequest(title="Voice draft", content="Opening line. Payoff line."),
        )
        lines = self.studio_service.split_script_into_lines(script.id, ScriptSplitLinesRequest())
        self.assertIsNotNone(lines)
        assert lines is not None

        jobs = self.queue_service.create_voice_jobs(
            script_id=script.id,
            script_text=script.content,
            narration_lines=lines,
            mode="line_by_line",
            voice_style="energetic narrator",
        )

        self.assertEqual(len(jobs), 2)
        self.assertTrue(all(job.provider == "google_ai_studio" for job in jobs))
        self.assertTrue(all(job.media_type == "audio" for job in jobs))
        self.assertEqual(
            [job.metadata["narrationLineId"] for job in jobs],
            [line.id for line in lines],
        )
        self.assertTrue(all(job.metadata["flow"] == "voice_generation" for job in jobs))

        completed = jobs[0].model_copy(
            update={
                "status": "completed",
                "result_url": "/api/generation/media/voice.mp3",
                "metadata": {**jobs[0].metadata, "durationSeconds": "1.5"},
            }
        )
        synced = self.studio_service.sync_narration_line_from_voice_job(completed)
        self.assertIsNotNone(synced)
        assert synced is not None
        self.assertEqual(synced.status, "done")
        self.assertEqual(synced.audio_asset_id, f"generated-{jobs[0].id}")
        self.assertEqual(synced.duration_seconds, 1.5)

        failed = jobs[1].model_copy(update={"status": "failed", "error": "provider failed"})
        failed_sync = self.studio_service.sync_narration_line_from_voice_job(failed)
        self.assertIsNotNone(failed_sync)
        assert failed_sync is not None
        self.assertEqual(failed_sync.status, "failed")
        self.assertEqual(failed_sync.error, "provider failed")

    def test_voice_jobs_can_target_one_narration_clip(self) -> None:
        script = self.studio_service.create_script(
            self.profile.id,
            ScriptCreateRequest(title="Voice clips", content="Opening line. Middle line. Payoff line."),
        )
        lines = self.studio_service.split_script_into_lines(script.id, ScriptSplitLinesRequest())
        self.assertIsNotNone(lines)
        assert lines is not None

        jobs = self.queue_service.create_voice_jobs(
            script_id=script.id,
            script_text=script.content,
            narration_lines=lines,
            mode="line_by_line",
            line_ids=[lines[1].id],
        )

        self.assertEqual(len(jobs), 1)
        self.assertEqual(jobs[0].scene_id, lines[1].id)
        self.assertEqual(jobs[0].prompt, "Middle line.")
        self.assertEqual(jobs[0].metadata["narrationLineId"], lines[1].id)
        self.assertEqual(jobs[0].metadata["lineIndex"], "1")

    def test_voice_jobs_can_be_claimed_completed_and_synced(self) -> None:
        script = self.studio_service.create_script(
            self.profile.id,
            ScriptCreateRequest(title="Voice queue", content="Opening line. Payoff line."),
        )
        lines = self.studio_service.split_script_into_lines(script.id, ScriptSplitLinesRequest())
        self.assertIsNotNone(lines)
        assert lines is not None

        jobs = self.queue_service.create_voice_jobs(
            script_id=script.id,
            script_text=script.content,
            narration_lines=lines,
            mode="line_by_line",
        )
        claimed = self.queue_service.claim_next_job(provider="google_ai_studio", worker_id="worker-1")
        self.assertIsNotNone(claimed)
        assert claimed is not None
        self.assertEqual(claimed.id, jobs[0].id)
        self.assertEqual(claimed.status, "running")

        completed = self.queue_service.complete_job_with_file(
            claimed.id,
            source_filename="voice.mp3",
            source_stream=BytesIO(b"fake-audio"),
            media_type="audio",
            metadata={"durationSeconds": "1.75", "capturedVia": "content-script-fetch-upload"},
        )
        self.assertIsNotNone(completed)
        assert completed is not None
        synced = self.studio_service.sync_narration_line_from_voice_job(completed)
        self.assertIsNotNone(synced)
        assert synced is not None
        self.assertEqual(completed.status, "completed")
        self.assertEqual(completed.media_type, "audio")
        self.assertEqual(completed.metadata["capturedVia"], "content-script-fetch-upload")
        self.assertEqual(synced.status, "done")
        self.assertEqual(synced.audio_asset_id, f"generated-{claimed.id}")
        self.assertEqual(synced.duration_seconds, 1.75)

    def test_timeline_draft_uses_narration_storyboard_and_generated_media(self) -> None:
        script = self.studio_service.create_script(
            self.profile.id,
            ScriptCreateRequest(title="Timeline draft", content="Hook line. Payoff line."),
        )
        lines = self.studio_service.split_script_into_lines(script.id, ScriptSplitLinesRequest())
        self.assertIsNotNone(lines)
        assert lines is not None
        first = self.studio_service.update_narration_line(
            lines[0].id,
            NarrationLineUpdateRequest(
                status="done",
                audioAssetId="generated-voice-job-1",
                durationSeconds=1.5,
            ),
        )
        second = self.studio_service.update_narration_line(
            lines[1].id,
            NarrationLineUpdateRequest(durationSeconds=2.0, pauseAfterSeconds=0.25),
        )
        self.assertIsNotNone(first)
        self.assertIsNotNone(second)
        detail = self.studio_service.get_script_detail(script.id)
        self.assertIsNotNone(detail)
        assert detail is not None

        scenes = [
            StoryboardScene(
                id="scene-001",
                start=0.0,
                end=1.5,
                transcript="Hook line.",
                prompt="opening visual",
                captionText="Hook line.",
            ),
            StoryboardScene(
                id="scene-002",
                start=1.5,
                end=3.5,
                transcript="Payoff line.",
                prompt="payoff visual",
                captionText="Payoff line.",
            ),
        ]
        assets = [
            GeneratedMediaAsset(
                jobId="visual-job-1",
                batchId="batch-1",
                sceneId="scene-001",
                provider="meta",
                mediaType="image",
                status="completed",
                resultUrl="/api/generation/media/scene-001.png",
                prompt="opening visual",
                start=0.0,
                end=1.5,
                duration=1.5,
            ),
        ]

        draft = self.timeline_builder_service.build_draft(detail, scenes, assets)

        self.assertEqual([clip.start for clip in draft.audio_clips], [0.0, 1.5])
        self.assertEqual([clip.asset_available for clip in draft.audio_clips], [True, False])
        self.assertEqual([clip.asset_available for clip in draft.visual_clips], [True, False])
        self.assertEqual([clip.text for clip in draft.caption_clips], ["Hook line.", "Payoff line."])
        self.assertEqual(draft.estimated_duration_seconds, 3.5)
        self.assertIn("1 narration line(s) do not have generated audio yet.", draft.warnings)
        self.assertIn("1 storyboard scene(s) do not have generated media yet.", draft.warnings)


if __name__ == "__main__":
    unittest.main()
