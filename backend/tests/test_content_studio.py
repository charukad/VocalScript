import tempfile
import unittest
from pathlib import Path

from backend.src.domain.models.content_profile import ContentProfileCreateRequest
from backend.src.domain.models.content_studio import (
    ContentIdeaCreateRequest,
    ContentIdeaUpdateRequest,
    NarrationLineCreateRequest,
    NarrationLineUpdateRequest,
    ScriptCreateRequest,
    ScriptSplitLinesRequest,
    ScriptUpdateRequest,
    ScriptVersionCreateRequest,
)
from backend.src.domain.services.content_profile_service import ContentProfileService
from backend.src.domain.services.content_studio_service import ContentStudioService
from backend.src.domain.services.generation_queue_service import GenerationQueueService
from backend.src.domain.services.sqlite_store import SQLiteStore


class ContentStudioTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)
        self.store = SQLiteStore(str(self.root / "registry.db"))
        self.profile_service = ContentProfileService(self.store)
        self.studio_service = ContentStudioService(self.store)
        self.queue_service = GenerationQueueService(str(self.root / "generated"))
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


if __name__ == "__main__":
    unittest.main()
