import json
import re
import uuid
from typing import Dict, List, Optional

from pydantic import ValidationError

from backend.src.domain.models.animation import (
    AnimationAssetMemoryItem,
    AnimationAssetNeed,
    AnimationCameraCue,
    AnimationCaptionCue,
    AnimationCharacterCue,
    AnimationLayoutCue,
    AnimationLayer,
    AnimationMotion,
    AnimationPlan,
    AnimationPlanRequest,
    AnimationScene,
    AnimationSceneCue,
)
from backend.src.domain.models.generation import TranscriptSlice
from backend.src.infrastructure.local_llm_service import LocalLLMService


SCENE_SECONDS_BY_DENSITY = {
    "low": 9.0,
    "medium": 6.0,
    "high": 4.0,
    "extra_high": 2.75,
}
WORDS_BY_DENSITY = {
    "low": 36,
    "medium": 22,
    "high": 14,
    "extra_high": 9,
}
STOPWORDS = {
    "about", "after", "again", "also", "another", "because", "before", "being", "between",
    "could", "every", "first", "from", "have", "into", "just", "like", "make", "many",
    "more", "most", "need", "only", "other", "over", "people", "really", "right", "same",
    "some", "than", "that", "their", "them", "then", "there", "these", "they", "thing",
    "this", "those", "through", "time", "very", "want", "what", "when", "where", "which",
    "with", "without", "work", "your",
}
VALID_REUSE_DECISIONS = {"reuse", "generate", "optional"}
VALID_ASSET_STATUSES = {"available", "missing", "queued", "generated", "failed"}
VALID_MOTION_PRESETS = {
    "none",
    "fade",
    "slide",
    "pop",
    "zoom",
    "pan",
    "float",
    "bounce",
    "caption_highlight",
    "push_in",
    "pull_out",
    "parallax",
}
VALID_POSES = {"neutral", "talking", "pointing", "thinking", "happy", "concerned"}
VALID_EXPRESSIONS = {"neutral", "smile", "focus", "surprise", "concern", "excited"}
VALID_MOUTH_CUES = {"closed", "open", "wide", "smile"}
VALID_LAYOUT_TEMPLATES = {"auto", "explainer_split", "center_focus", "lower_third", "portrait_stack", "square_card"}
VALID_CAPTION_TEMPLATES = {"clean_subtitle", "keyword_pop", "karaoke_highlight", "headline_burst"}


class AnimationPlannerService:
    def __init__(self, local_llm: LocalLLMService):
        self.local_llm = local_llm

    def create_plan(self, request: AnimationPlanRequest) -> AnimationPlan:
        normalized = self._normalize_request(request)
        llm_payload = self.local_llm.generate_animation_plan_json(normalized)
        if llm_payload:
            plan = self._parse_llm_plan(llm_payload, normalized)
            if plan:
                return plan
        return self._create_rule_based_plan(normalized)

    def _normalize_request(self, request: AnimationPlanRequest) -> AnimationPlanRequest:
        segments = [
            TranscriptSlice(
                start=max(0.0, segment.start),
                end=max(max(0.0, segment.start) + 0.1, segment.end),
                text=segment.text.strip(),
            )
            for segment in request.segments
            if segment.text.strip()
        ]
        segments.sort(key=lambda segment: segment.start)
        transcript = request.transcript.strip() or " ".join(segment.text for segment in segments)
        available_assets = [
            asset.model_copy(
                update={
                    "name": asset.name.strip(),
                    "style": asset.style.strip(),
                    "tags": [tag.strip().lower() for tag in asset.tags if tag.strip()],
                }
            )
            for asset in request.available_assets
            if asset.name.strip()
        ]
        return AnimationPlanRequest(
            transcript=transcript,
            segments=segments,
            availableAssets=available_assets,
            style=request.style.strip() or "animated explainer",
            aspectRatio=request.aspect_ratio,
            sceneDensity=request.scene_density,
            motionIntensity=request.motion_intensity,
            promptDetail=request.prompt_detail,
            layoutTemplate=request.layout_template,
            captionTemplate=request.caption_template,
            provider=request.provider,
        )

    def _parse_llm_plan(self, payload: str, request: AnimationPlanRequest) -> Optional[AnimationPlan]:
        try:
            parsed = json.loads(self._extract_json(payload))
        except json.JSONDecodeError:
            return None
        if not isinstance(parsed, dict):
            return None

        raw_needs = parsed.get("assetNeeds") or parsed.get("asset_needs") or []
        raw_scenes = parsed.get("scenes") or []
        if not isinstance(raw_needs, list) or not isinstance(raw_scenes, list):
            return None

        needs: List[AnimationAssetNeed] = []
        for index, raw_need in enumerate(raw_needs, 1):
            if not isinstance(raw_need, dict):
                continue
            need = self._repair_asset_need(raw_need, index, request)
            needs.append(self._apply_reuse_decision(need, request.available_assets))
        needs_by_id = {need.id: need for need in needs}

        scenes: List[AnimationScene] = []
        for index, raw_scene in enumerate(raw_scenes, 1):
            if not isinstance(raw_scene, dict):
                continue
            try:
                scene = self._repair_scene(raw_scene, index, request, needs_by_id)
                scenes.append(scene)
            except ValidationError:
                continue

        if not scenes or not needs:
            return None
        scenes = self._repair_scene_timing(scenes)
        return AnimationPlan(
            id=f"animation-plan-{uuid.uuid4().hex[:10]}",
            style=request.style,
            aspectRatio=request.aspect_ratio,
            scenes=scenes,
            assetNeeds=needs,
            warnings=self._warnings_for_plan(needs),
            usedLlmMode=self.local_llm.settings.mode or "llm",
            transcript=request.transcript,
            segments=request.segments,
            duration=self._duration(scenes),
            rendererRecommendation=str(parsed.get("rendererRecommendation") or parsed.get("renderer_recommendation") or "existing_timeline_v1_remotion_candidate"),
            rendererNotes=self._renderer_notes(parsed.get("rendererNotes") or parsed.get("renderer_notes")),
        )

    def _create_rule_based_plan(self, request: AnimationPlanRequest) -> AnimationPlan:
        groups = self._group_timed_segments(request.segments, request.scene_density) if request.segments else self._group_words(request.transcript, request.scene_density)
        background = self._apply_reuse_decision(
            self._make_asset_need(
                "main background",
                "background",
                f"Reusable {request.style} background for the full video",
                request,
                ["background", "setting", "reusable"],
            ),
            request.available_assets,
        )
        character = self._apply_reuse_decision(
            self._make_asset_need(
                "main narrator character",
                "character",
                f"Consistent {request.style} narrator character, transparent background if possible",
                request,
                ["character", "narrator", "reusable"],
            ),
            request.available_assets,
        )

        needs_by_key: Dict[str, AnimationAssetNeed] = {
            self._need_key(background): background,
            self._need_key(character): character,
        }
        scenes: List[AnimationScene] = []

        for index, (start, end, text) in enumerate(groups, 1):
            keyword = self._keyword_for_text(text)
            layout_cue = self._layout_cue_for_request(request)
            layout_positions = self._layout_positions(layout_cue.template)
            caption_cue = self._caption_cue_for_text(text, request.caption_template)
            character_cue = self._character_cue_for_text(text, character.id)
            camera_cue = self._camera_cue_for_scene(index, request.motion_intensity, keyword)
            transcript_triggers = self._trigger_words_for_text(text)
            pose_need = self._pose_need_for_cue(character_cue, request)
            if pose_need:
                key = self._need_key(pose_need)
                if key not in needs_by_key:
                    needs_by_key[key] = self._apply_reuse_decision(pose_need, request.available_assets)
                character_cue = character_cue.model_copy(update={"pose_asset_need_id": needs_by_key[key].id})
            prop_need: Optional[AnimationAssetNeed] = None
            if keyword:
                candidate = self._make_asset_need(
                    keyword,
                    "icon",
                    f"Reusable visual icon or prop representing {keyword}",
                    request,
                    ["icon", "prop", keyword],
                    optional=index > 5,
                )
                key = self._need_key(candidate)
                if key not in needs_by_key:
                    needs_by_key[key] = self._apply_reuse_decision(candidate, request.available_assets)
                prop_need = needs_by_key[key]

            scene_id = f"anim-scene-{index:03d}"
            layers = [
                AnimationLayer(
                    id=f"{scene_id}-background",
                    sceneId=scene_id,
                    layerType="background",
                    assetNeedId=background.id,
                    start=start,
                    end=end,
                    order=0,
                    x=50,
                    y=50,
                    scale=layout_positions["background_scale"],
                    opacity=100,
                    motion=AnimationMotion(
                        preset=camera_cue.preset,
                        direction=camera_cue.direction,
                        intensity=request.motion_intensity,
                        note=camera_cue.note,
                    ),
                ),
                AnimationLayer(
                    id=f"{scene_id}-character",
                    sceneId=scene_id,
                    layerType="character",
                    assetNeedId=character.id,
                    start=start,
                    end=end,
                    order=10,
                    x=layout_positions["character_x"],
                    y=layout_positions["character_y"],
                    scale=layout_positions["character_scale"],
                    opacity=100,
                    motion=AnimationMotion(
                        preset="float" if index > 1 else "slide",
                        direction="left",
                        intensity=request.motion_intensity,
                        note=f"Reuse the base character; pose cue is {character_cue.pose} with {character_cue.expression} expression.",
                    ),
                ),
                AnimationLayer(
                    id=f"{scene_id}-caption",
                    sceneId=scene_id,
                    layerType="caption",
                    text=self._caption_text_for_template(text, caption_cue.template),
                    start=start,
                    end=end,
                    order=40,
                    x=50,
                    y=layout_positions["caption_y"],
                    scale=100,
                    opacity=100,
                    motion=AnimationMotion(
                        preset="caption_highlight",
                        intensity=request.motion_intensity,
                        note=caption_cue.note,
                    ),
                ),
            ]
            if prop_need:
                layers.insert(
                    2,
                    AnimationLayer(
                        id=f"{scene_id}-prop",
                        sceneId=scene_id,
                        layerType="icon",
                        assetNeedId=prop_need.id,
                        start=start,
                        end=end,
                        order=20,
                        x=layout_positions["prop_x"],
                        y=layout_positions["prop_y"],
                        scale=layout_positions["prop_scale"],
                        opacity=100,
                        motion=AnimationMotion(
                            preset="bounce" if request.motion_intensity == "dynamic" else "pop",
                            direction="center",
                            intensity=request.motion_intensity,
                            note=f"Bring in the reusable {prop_need.name} asset as a visual cue.",
                        ),
                    ),
                )
            scenes.append(
                AnimationScene(
                    id=scene_id,
                    start=start,
                    end=end,
                    transcript=text,
                    summary=self._summary(text),
                    direction=self._direction(
                        text,
                        request.motion_intensity,
                        layout_cue.template,
                        camera_cue.preset,
                        caption_cue.template,
                    ),
                    status="draft",
                    layers=layers,
                    cue=AnimationSceneCue(
                        character=character_cue,
                        layout=layout_cue,
                        caption=caption_cue,
                        camera=camera_cue,
                        transcriptTriggers=transcript_triggers,
                    ),
                )
            )

        asset_needs = list(needs_by_key.values())
        return AnimationPlan(
            id=f"animation-plan-{uuid.uuid4().hex[:10]}",
            style=request.style,
            aspectRatio=request.aspect_ratio,
            scenes=scenes,
            assetNeeds=asset_needs,
            warnings=self._warnings_for_plan(asset_needs),
            usedLlmMode="rule_based",
            transcript=request.transcript,
            segments=request.segments,
            duration=self._duration(scenes),
            rendererRecommendation="existing_timeline_v1_remotion_candidate",
            rendererNotes=self._renderer_notes(None),
        )

    def _make_asset_need(
        self,
        name: str,
        asset_type: str,
        description: str,
        request: AnimationPlanRequest,
        tags: List[str],
        optional: bool = False,
    ) -> AnimationAssetNeed:
        safe_name = self._clean_label(name)
        prompt_detail = "clean, simple, reusable asset" if request.prompt_detail == "simple" else "clean, polished, reusable asset with consistent style"
        return AnimationAssetNeed(
            id=f"anim-asset-{self._slug(asset_type)}-{self._slug(safe_name)}",
            name=safe_name,
            assetType=asset_type,
            description=description,
            prompt=f"{request.style}, {prompt_detail}: {description}. No readable text, no watermark.",
            style=request.style,
            tags=[tag.lower() for tag in tags if tag],
            reuseDecision="optional" if optional else "generate",
            status="missing",
            optional=optional,
        )

    def _repair_asset_need(self, raw: dict, index: int, request: AnimationPlanRequest) -> AnimationAssetNeed:
        asset_type = str(raw.get("assetType") or raw.get("asset_type") or "prop")
        if asset_type not in ("character", "background", "prop", "icon", "overlay", "text"):
            asset_type = "prop"
        name = self._clean_label(str(raw.get("name") or f"{asset_type} {index}"))
        description = str(raw.get("description") or f"Reusable {asset_type}: {name}")
        tags = raw.get("tags") if isinstance(raw.get("tags"), list) else [asset_type, name]
        reuse_decision = str(raw.get("reuseDecision") or raw.get("reuse_decision") or "generate")
        status = str(raw.get("status") or "missing")
        return AnimationAssetNeed(
            id=str(raw.get("id") or f"anim-asset-{self._slug(asset_type)}-{self._slug(name)}"),
            name=name,
            assetType=asset_type,
            description=description,
            prompt=str(raw.get("prompt") or f"{request.style}, reusable {asset_type} asset: {description}. No readable text."),
            negativePrompt=str(raw.get("negativePrompt") or raw.get("negative_prompt") or "low quality, blurry, distorted, watermark, readable text"),
            style=str(raw.get("style") or request.style),
            tags=[str(tag).strip().lower() for tag in tags if str(tag).strip()],
            reuseDecision=reuse_decision if reuse_decision in VALID_REUSE_DECISIONS else "generate",
            status=status if status in VALID_ASSET_STATUSES else "missing",
            matchedAssetId=raw.get("matchedAssetId") or raw.get("matched_asset_id"),
            optional=bool(raw.get("optional", False)),
        )

    def _repair_scene(
        self,
        raw: dict,
        index: int,
        request: AnimationPlanRequest,
        needs_by_id: Dict[str, AnimationAssetNeed],
    ) -> AnimationScene:
        start = self._safe_float(raw.get("start"), (index - 1) * 5.0)
        end = max(start + 0.1, self._safe_float(raw.get("end"), start + 5.0))
        scene_id = str(raw.get("id") or f"anim-scene-{index:03d}")
        transcript = str(raw.get("transcript") or raw.get("text") or self._transcript_for_time(request.segments, start, end) or "").strip()
        cue = self._repair_scene_cue(raw.get("cue"), transcript, request, scene_id)
        raw_layers = raw.get("layers") if isinstance(raw.get("layers"), list) else []
        layers: List[AnimationLayer] = []
        for layer_index, raw_layer in enumerate(raw_layers, 1):
            if not isinstance(raw_layer, dict):
                continue
            layer_type = str(raw_layer.get("layerType") or raw_layer.get("layer_type") or "text")
            if layer_type not in ("background", "character", "prop", "icon", "overlay", "text", "caption", "placeholder"):
                layer_type = "text"
            asset_need_id = raw_layer.get("assetNeedId") or raw_layer.get("asset_need_id")
            if asset_need_id and asset_need_id not in needs_by_id:
                asset_need_id = None
            motion_raw = raw_layer.get("motion") if isinstance(raw_layer.get("motion"), dict) else {}
            motion_preset = str(motion_raw.get("preset") or "none")
            layers.append(
                AnimationLayer(
                    id=str(raw_layer.get("id") or f"{scene_id}-layer-{layer_index}"),
                    sceneId=scene_id,
                    layerType=layer_type,
                    assetNeedId=asset_need_id,
                    text=str(raw_layer.get("text") or ""),
                    start=max(start, self._safe_float(raw_layer.get("start"), start)),
                    end=min(end, max(start + 0.1, self._safe_float(raw_layer.get("end"), end))),
                    order=int(self._safe_float(raw_layer.get("order"), layer_index * 10)),
                    x=self._safe_float(raw_layer.get("x"), 50.0),
                    y=self._safe_float(raw_layer.get("y"), 50.0),
                    scale=self._safe_float(raw_layer.get("scale"), 100.0),
                    opacity=self._safe_float(raw_layer.get("opacity"), 100.0),
                    motion=AnimationMotion(
                        preset=motion_preset if motion_preset in VALID_MOTION_PRESETS else "none",
                        direction=str(motion_raw.get("direction") or ""),
                        intensity=request.motion_intensity,
                        note=str(motion_raw.get("note") or ""),
                    ),
                )
            )
        if not layers:
            layers.append(
                AnimationLayer(
                    id=f"{scene_id}-caption",
                    sceneId=scene_id,
                    layerType="caption",
                    text=self._caption_text_for_template(transcript, cue.caption.template),
                    start=start,
                    end=end,
                    order=40,
                    y=84,
                    motion=AnimationMotion(preset="caption_highlight", intensity=request.motion_intensity),
                )
            )
        return AnimationScene(
            id=scene_id,
            start=start,
            end=end,
            transcript=transcript,
            summary=str(raw.get("summary") or self._summary(transcript)),
            direction=str(raw.get("direction") or self._direction(
                transcript,
                request.motion_intensity,
                cue.layout.template,
                cue.camera.preset,
                cue.caption.template,
            )),
            status="draft",
            layers=layers,
            cue=cue,
        )

    def _repair_scene_cue(
        self,
        raw: object,
        transcript: str,
        request: AnimationPlanRequest,
        scene_id: str,
    ) -> AnimationSceneCue:
        raw_cue = raw if isinstance(raw, dict) else {}
        default_character = self._character_cue_for_text(transcript, None)
        default_layout = self._layout_cue_for_request(request)
        default_caption = self._caption_cue_for_text(transcript, request.caption_template)
        default_camera = self._camera_cue_for_scene(1, request.motion_intensity, self._keyword_for_text(transcript))

        character_raw = raw_cue.get("character") if isinstance(raw_cue.get("character"), dict) else {}
        pose = str(character_raw.get("pose") or default_character.pose)
        expression = str(character_raw.get("expression") or default_character.expression)
        mouth_cue = str(character_raw.get("mouthCue") or character_raw.get("mouth_cue") or default_character.mouth_cue)

        layout_raw = raw_cue.get("layout") if isinstance(raw_cue.get("layout"), dict) else {}
        layout_template = str(layout_raw.get("template") or default_layout.template)
        if layout_template == "auto":
            layout_template = self._layout_template_for_aspect(request.aspect_ratio)

        caption_raw = raw_cue.get("caption") if isinstance(raw_cue.get("caption"), dict) else {}
        caption_template = str(caption_raw.get("template") or default_caption.template)
        caption_keywords = self._clean_keywords(caption_raw.get("keywords"), transcript)

        camera_raw = raw_cue.get("camera") if isinstance(raw_cue.get("camera"), dict) else {}
        camera_preset = str(camera_raw.get("preset") or default_camera.preset)

        triggers_raw = raw_cue.get("transcriptTriggers") or raw_cue.get("transcript_triggers")
        transcript_triggers = self._clean_keywords(triggers_raw, transcript) or self._trigger_words_for_text(transcript)

        safe_area_raw = layout_raw.get("safeArea") or layout_raw.get("safe_area")
        safe_area = self._safe_area_for_layout(layout_template)
        if isinstance(safe_area_raw, dict):
            safe_area.update({
                str(key): self._safe_float(value, safe_area.get(str(key), 0.0))
                for key, value in safe_area_raw.items()
            })

        return AnimationSceneCue(
            character=AnimationCharacterCue(
                assetNeedId=character_raw.get("assetNeedId") or character_raw.get("asset_need_id"),
                poseAssetNeedId=character_raw.get("poseAssetNeedId") or character_raw.get("pose_asset_need_id"),
                pose=pose if pose in VALID_POSES else default_character.pose,
                expression=expression if expression in VALID_EXPRESSIONS else default_character.expression,
                mouthCue=mouth_cue if mouth_cue in VALID_MOUTH_CUES else default_character.mouth_cue,
                note=str(character_raw.get("note") or default_character.note),
            ),
            layout=AnimationLayoutCue(
                template=layout_template if layout_template in VALID_LAYOUT_TEMPLATES else default_layout.template,
                safeArea=safe_area,
                note=str(layout_raw.get("note") or default_layout.note),
            ),
            caption=AnimationCaptionCue(
                template=caption_template if caption_template in VALID_CAPTION_TEMPLATES else default_caption.template,
                keywords=caption_keywords,
                note=str(caption_raw.get("note") or default_caption.note),
            ),
            camera=AnimationCameraCue(
                preset=camera_preset if camera_preset in VALID_MOTION_PRESETS else default_camera.preset,
                direction=str(camera_raw.get("direction") or default_camera.direction),
                note=str(camera_raw.get("note") or default_camera.note),
            ),
            transcriptTriggers=transcript_triggers,
        )

    def _apply_reuse_decision(
        self,
        need: AnimationAssetNeed,
        available_assets: List[AnimationAssetMemoryItem],
    ) -> AnimationAssetNeed:
        match = self._find_matching_asset(need, available_assets)
        if match:
            return need.model_copy(
                update={
                    "reuse_decision": "reuse",
                    "status": match.status if match.status in ("available", "generated") else "available",
                    "matched_asset_id": match.id,
                }
            )
        if need.optional:
            return need.model_copy(update={"reuse_decision": "optional", "status": "missing"})
        return need.model_copy(update={"reuse_decision": "generate", "status": "missing"})

    def _find_matching_asset(
        self,
        need: AnimationAssetNeed,
        available_assets: List[AnimationAssetMemoryItem],
    ) -> Optional[AnimationAssetMemoryItem]:
        need_tokens = set(self._tokens(" ".join([need.name, need.description, " ".join(need.tags)])))
        for asset in available_assets:
            if asset.asset_type != need.asset_type:
                continue
            asset_tokens = set(self._tokens(" ".join([asset.name, asset.style, " ".join(asset.tags)])))
            if not asset_tokens:
                continue
            if need_tokens & asset_tokens or self._slug(asset.name) == self._slug(need.name):
                return asset
        return None

    def _group_timed_segments(self, segments: List[TranscriptSlice], density: str) -> List[tuple[float, float, str]]:
        groups: List[tuple[float, float, str]] = []
        current_start: Optional[float] = None
        current_end = 0.0
        current_text: List[str] = []
        max_scene_seconds = SCENE_SECONDS_BY_DENSITY.get(density, 6.0)
        for segment in segments:
            if current_start is None:
                current_start = segment.start
            proposed_duration = segment.end - current_start
            should_flush = current_text and proposed_duration > max_scene_seconds and self._ends_sentence(current_text[-1])
            hard_flush = current_text and proposed_duration > max_scene_seconds * 1.35
            if should_flush or hard_flush:
                groups.append((current_start, current_end, " ".join(current_text)))
                current_start = segment.start
                current_text = []
            current_text.append(segment.text.strip())
            current_end = max(current_end, segment.end)
        if current_start is not None and current_text:
            groups.append((current_start, current_end, " ".join(current_text)))
        return groups or [(0.0, 5.0, "Create a clear animated intro.")]

    def _group_words(self, transcript: str, density: str) -> List[tuple[float, float, str]]:
        words = transcript.split()
        if not words:
            return [(0.0, 5.0, "Create a clear animated intro.")]
        words_per_scene = WORDS_BY_DENSITY.get(density, 22)
        groups: List[tuple[float, float, str]] = []
        for index in range(0, len(words), words_per_scene):
            scene_index = len(groups)
            start = scene_index * 5.0
            groups.append((start, start + 5.0, " ".join(words[index:index + words_per_scene])))
        return groups

    def _repair_scene_timing(self, scenes: List[AnimationScene]) -> List[AnimationScene]:
        repaired: List[AnimationScene] = []
        for scene in sorted(scenes, key=lambda item: item.start):
            start = max(0.0, scene.start)
            end = max(start + 0.1, scene.end)
            repaired.append(scene.model_copy(update={"start": round(start, 3), "end": round(end, 3)}))
        return repaired

    def _warnings_for_plan(self, needs: List[AnimationAssetNeed]) -> List[str]:
        missing = [need for need in needs if need.reuse_decision == "generate"]
        if not missing:
            return ["All planned visual assets can be reused from the current project library."]
        return [f"{len(missing)} reusable asset{'s' if len(missing) != 1 else ''} need generation before a complete animated timeline can be built."]

    def _layout_cue_for_request(self, request: AnimationPlanRequest) -> AnimationLayoutCue:
        template = request.layout_template
        if template == "auto":
            template = self._layout_template_for_aspect(request.aspect_ratio)
        if template not in VALID_LAYOUT_TEMPLATES or template == "auto":
            template = "explainer_split"
        return AnimationLayoutCue(
            template=template,
            safeArea=self._safe_area_for_layout(template),
            note=f"{template.replace('_', ' ')} layout for {request.aspect_ratio} animation.",
        )

    def _layout_template_for_aspect(self, aspect_ratio: str) -> str:
        if aspect_ratio == "9:16":
            return "portrait_stack"
        if aspect_ratio == "1:1":
            return "square_card"
        if aspect_ratio == "4:5":
            return "portrait_stack"
        return "explainer_split"

    def _safe_area_for_layout(self, template: str) -> Dict[str, float]:
        if template == "portrait_stack":
            return {"left": 8.0, "right": 8.0, "top": 7.0, "bottom": 10.0}
        if template == "square_card":
            return {"left": 10.0, "right": 10.0, "top": 9.0, "bottom": 10.0}
        if template == "lower_third":
            return {"left": 7.0, "right": 7.0, "top": 8.0, "bottom": 18.0}
        if template == "center_focus":
            return {"left": 8.0, "right": 8.0, "top": 8.0, "bottom": 9.0}
        return {"left": 6.0, "right": 6.0, "top": 8.0, "bottom": 8.0}

    def _layout_positions(self, template: str) -> Dict[str, float]:
        if template == "portrait_stack":
            return {
                "background_scale": 106.0,
                "character_x": 50.0,
                "character_y": 61.0,
                "character_scale": 76.0,
                "prop_x": 50.0,
                "prop_y": 34.0,
                "prop_scale": 42.0,
                "caption_y": 84.0,
            }
        if template == "square_card":
            return {
                "background_scale": 106.0,
                "character_x": 50.0,
                "character_y": 62.0,
                "character_scale": 78.0,
                "prop_x": 50.0,
                "prop_y": 38.0,
                "prop_scale": 44.0,
                "caption_y": 82.0,
            }
        if template == "lower_third":
            return {
                "background_scale": 105.0,
                "character_x": 31.0,
                "character_y": 63.0,
                "character_scale": 78.0,
                "prop_x": 70.0,
                "prop_y": 39.0,
                "prop_scale": 46.0,
                "caption_y": 76.0,
            }
        if template == "center_focus":
            return {
                "background_scale": 105.0,
                "character_x": 50.0,
                "character_y": 66.0,
                "character_scale": 78.0,
                "prop_x": 50.0,
                "prop_y": 38.0,
                "prop_scale": 46.0,
                "caption_y": 82.0,
            }
        return {
            "background_scale": 108.0,
            "character_x": 28.0,
            "character_y": 68.0,
            "character_scale": 82.0,
            "prop_x": 70.0,
            "prop_y": 48.0,
            "prop_scale": 48.0,
            "caption_y": 84.0,
        }

    def _caption_cue_for_text(self, text: str, requested_template: str) -> AnimationCaptionCue:
        template = requested_template if requested_template in VALID_CAPTION_TEMPLATES else "keyword_pop"
        keywords = self._trigger_words_for_text(text)
        if template == "headline_burst":
            note = "Use the scene summary as a compact headline-style caption."
        elif template == "karaoke_highlight":
            note = "Prepare word-by-word highlight timing placeholders from the transcript."
        elif template == "clean_subtitle":
            note = "Keep captions readable and low in the safe area."
        else:
            note = "Pop important transcript keywords while keeping captions editable."
        return AnimationCaptionCue(template=template, keywords=keywords, note=note)

    def _character_cue_for_text(self, text: str, asset_need_id: Optional[str]) -> AnimationCharacterCue:
        tokens = set(self._tokens(text))
        lower = text.lower()
        pose = "talking"
        expression = "neutral"
        mouth_cue = "open" if text.strip() else "closed"
        if "?" in text or tokens & {"why", "how", "what", "when", "where"}:
            pose = "thinking"
            expression = "focus"
        if tokens & {"warning", "risk", "problem", "issue", "mistake", "fail", "failed"}:
            pose = "concerned"
            expression = "concern"
        if tokens & {"success", "growth", "win", "wins", "improve", "better", "great"}:
            pose = "happy"
            expression = "smile"
            mouth_cue = "smile"
        if tokens & {"show", "point", "look", "notice", "watch"}:
            pose = "pointing"
            expression = "focus"
        if tokens & {"surprise", "wow", "suddenly"}:
            expression = "surprise"
            mouth_cue = "wide"
        return AnimationCharacterCue(
            assetNeedId=asset_need_id,
            pose=pose,
            expression=expression,
            mouthCue=mouth_cue,
            note=f"Pose/expression cue from transcript: {lower[:90]}",
        )

    def _pose_need_for_cue(
        self,
        cue: AnimationCharacterCue,
        request: AnimationPlanRequest,
    ) -> Optional[AnimationAssetNeed]:
        if cue.pose in ("neutral", "talking"):
            return None
        return self._make_asset_need(
            f"main narrator character {cue.pose} pose",
            "character",
            f"Optional reusable pose variant for the narrator: {cue.pose} pose with {cue.expression} expression, transparent background if possible",
            request,
            ["character", "narrator", "pose", cue.pose, cue.expression],
            optional=True,
        )

    def _camera_cue_for_scene(self, index: int, intensity: str, keyword: str) -> AnimationCameraCue:
        if intensity == "dynamic":
            preset = "parallax" if keyword and index % 2 == 0 else "push_in"
            if index % 3 == 0:
                preset = "pull_out"
        elif intensity == "subtle":
            preset = "push_in"
        else:
            preset = "push_in" if index % 2 else "pull_out"
        direction = "center" if preset != "parallax" else "depth"
        note = f"Camera brain: {preset.replace('_', ' ')} on reusable layers"
        if keyword:
            note += f" around the {keyword} cue"
        return AnimationCameraCue(preset=preset, direction=direction, note=note + ".")

    def _trigger_words_for_text(self, text: str) -> List[str]:
        triggers = []
        keyword = self._keyword_for_text(text)
        if keyword:
            triggers.append(keyword)
        tokens = set(self._tokens(text))
        for label, words in (
            ("question", {"why", "how", "what", "when", "where"}),
            ("warning", {"warning", "risk", "problem", "issue", "mistake"}),
            ("growth", {"growth", "success", "improve", "better", "win"}),
            ("steps", {"first", "second", "third", "step", "steps"}),
        ):
            if tokens & words:
                triggers.append(label)
        if re.search(r"\b\d+\b", text):
            triggers.append("number")
        return list(dict.fromkeys(triggers))[:5]

    def _clean_keywords(self, raw: object, fallback_text: str) -> List[str]:
        if isinstance(raw, list):
            candidates = [str(item).strip().lower() for item in raw]
        elif isinstance(raw, str):
            candidates = self._tokens(raw)
        else:
            candidates = self._trigger_words_for_text(fallback_text)
        cleaned = [
            token for token in candidates
            if token and len(token) > 2 and token not in STOPWORDS
        ]
        return list(dict.fromkeys(cleaned))[:5]

    def _renderer_notes(self, raw: object) -> List[str]:
        if isinstance(raw, list):
            notes = [str(item).strip() for item in raw if str(item).strip()]
            if notes:
                return notes[:5]
        return [
            "V1 remains on the existing timeline/keyframe renderer.",
            "Remotion is a future optional renderer candidate for richer parallax, character rigs, lip sync, and kinetic type.",
        ]

    def _keyword_for_text(self, text: str) -> str:
        candidates = [
            token for token in self._tokens(text)
            if len(token) > 4 and token not in STOPWORDS
        ]
        if not candidates:
            return ""
        counts: Dict[str, int] = {}
        for token in candidates:
            counts[token] = counts.get(token, 0) + 1
        return sorted(counts, key=lambda token: (-counts[token], candidates.index(token)))[0]

    def _tokens(self, text: str) -> List[str]:
        return re.findall(r"[a-z0-9]+", text.lower())

    def _caption_text(self, text: str) -> str:
        words = text.split()
        return " ".join(words[:14]) + ("..." if len(words) > 14 else "")

    def _caption_text_for_template(self, text: str, template: str) -> str:
        if template == "headline_burst":
            return self._summary(text).upper()
        return self._caption_text(text)

    def _summary(self, text: str) -> str:
        words = text.split()
        return " ".join(words[:12]) + ("..." if len(words) > 12 else "")

    def _direction(
        self,
        text: str,
        intensity: str,
        layout_template: str,
        camera_preset: str,
        caption_template: str,
    ) -> str:
        keyword = self._keyword_for_text(text)
        cue = f" with a {keyword} visual cue" if keyword else ""
        return (
            f"{intensity} layered explainer animation{cue}; "
            f"{layout_template.replace('_', ' ')} layout, "
            f"{camera_preset.replace('_', ' ')} camera, "
            f"{caption_template.replace('_', ' ')} captions."
        )

    def _duration(self, scenes: List[AnimationScene]) -> float:
        return max((scene.end for scene in scenes), default=0.0)

    def _need_key(self, need: AnimationAssetNeed) -> str:
        return f"{need.asset_type}:{self._slug(need.name)}"

    def _clean_label(self, value: str) -> str:
        return " ".join(value.strip().split())[:80] or "asset"

    def _slug(self, value: str) -> str:
        return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-") or "asset"

    def _ends_sentence(self, text: str) -> bool:
        return text.strip().endswith((".", "!", "?"))

    def _safe_float(self, value: object, fallback: float) -> float:
        try:
            return float(value)  # type: ignore[arg-type]
        except (TypeError, ValueError):
            return fallback

    def _transcript_for_time(self, segments: List[TranscriptSlice], start: float, end: float) -> str:
        parts = [
            segment.text.strip()
            for segment in segments
            if segment.end > start and segment.start < end and segment.text.strip()
        ]
        return " ".join(parts)

    def _extract_json(self, payload: str) -> str:
        stripped = payload.strip()
        if stripped.startswith("```"):
            stripped = stripped.strip("`").strip()
            if stripped.lower().startswith("json"):
                stripped = stripped[4:].strip()
        start = stripped.find("{")
        end = stripped.rfind("}")
        if start != -1 and end != -1 and end > start:
            return stripped[start:end + 1]
        return stripped
