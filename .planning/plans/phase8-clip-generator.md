# Phase 8: Clip Generator

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds. This document must be maintained in accordance with `.planning/EXECPLAN.md`.

## Purpose / Big Picture

After this phase, the user can generate a video clip from their clip recipe. The app reads the grid built in Phase 7 (Clip Builder Interface), renders each frame off-screen using Three.js, encodes the frames into an MP4 using the WebCodecs API, and delivers a downloadable video file. The entire process runs in the browser — no server, no ffmpeg, no native code. It works on PC, Mac, iPad, and iPhone.

To see it working: build a clip recipe in the Clip Builder grid (Phase 7), click "Generate Clip," watch a progress bar, and download the resulting MP4. The video shows stitch groups appearing, blinking, and transitioning according to the recipe, with a transparent or solid background.

**Fallback**: On browsers without WebCodecs support, the app exports numbered PNG frames (001.png, 002.png...) plus a `meta.json` file. The user encodes these externally using ffmpeg or any video tool.

## Progress

- [ ] Milestone 1: Frame renderer — off-screen Three.js scene setup
- [ ] Milestone 2: Recipe interpreter — translate grid cells to per-frame visibility/animation state
- [ ] Milestone 3: WebCodecs encoding pipeline — frame-by-frame encode to MP4
- [ ] Milestone 4: PNG fallback export
- [ ] Milestone 5: Generate UI — button, progress bar, cancel, download
- [ ] Milestone 6: Animation effects — blink, show, and extensible effect system

## Surprises & Discoveries

(None yet.)

## Decision Log

- Decision: Frame-by-frame off-screen rendering, not real-time screen recording.
  Rationale: Screen recording is flaky — frame drops, timing issues, resolution inconsistency. Off-screen rendering is deterministic: every frame is perfect regardless of how long it takes to render. If one frame takes 3 seconds and another takes 50ms, the output video still plays at the target FPS.
  Date: 2026-03-28

- Decision: WebCodecs API + mp4-mux for in-browser encoding. No Remotion, no ffmpeg.
  Rationale: Must run on iPad/iPhone/Android in the browser. WebCodecs is browser-built-in, hardware-accelerated (H.264), and produces standard MP4. mp4-mux is a small JS library (~10-20KB) that wraps encoded frames into an MP4 container. All in-memory, single pipeline, no intermediate files.
  Date: 2026-03-28

- Decision: PNG fallback for browsers without WebCodecs.
  Rationale: WebCodecs requires Safari 16.4+ / Chrome 94+. Older browsers fall back to exporting numbered PNGs + meta.json. The user encodes externally. This keeps the app functional everywhere.
  Date: 2026-03-28

- Decision: Encoding pipeline is decoupled from rendering. Render produces frames, encoder consumes them.
  Rationale: Clean separation allows swapping the encoder (WebCodecs vs PNG export) without changing the renderer. Also allows future encoders (WebM, GIF, etc.).
  Date: 2026-03-28

## Outcomes & Retrospective

(Not yet started.)

## Context and Orientation

This phase depends on Phase 7 (Clip Builder Interface). The relevant modules are:

- `modules/ClipRecipe.js` (Phase 7) — the 2D grid data model. `getCell(groupIndex, sectionIndex)` returns `{effect, config} | null`. `exportJSON()` / `importJSON()` for persistence. Stores video reference (name, path).

- `ui/ClipBuilderPanel.js` (Phase 7) — the grid UI. This phase does not modify it, only reads the ClipRecipe data.

- `modules/StitchRenderer.js` — InstancedMesh rendering with custom ShaderMaterial. Renders stitch symbols from the texture atlas. Supports per-stitch visibility, color tinting, and opacity. This is what renders each frame.

- `modules/StitchStore.js` — data store for all placed stamps. Each stamp has position, rotation, scale, setId, colorOverride, opacity.

- `modules/SetManager.js` — numbered stitch groups. Each set has id, color, blinkColor, visibility.

- `ui/Viewport.js` — Three.js orthographic canvas, camera, renderer. The off-screen renderer will use a similar setup but render to an off-screen canvas (not the visible viewport).

- `modules/StitchAtlas.js` — texture atlas for GPU rendering of stitch symbols.

- `ui/VideoZone.js` — provides `sections` (array of `{start, end}`) and `bookmarks` (array of timestamps). Used to determine frame timing.

### Key terms

- **Clip recipe**: The 2D grid from Phase 7. Maps groups to sections with effect assignments.
- **Frame**: A single image at a specific point in time. The generator produces one frame per time step (e.g., at 30fps, a 10-second clip = 300 frames).
- **Off-screen rendering**: Three.js renders to a canvas that is not displayed on screen. The pixel data is read from this canvas for encoding.
- **WebCodecs**: A browser API for low-level video encoding/decoding. `VideoEncoder` takes raw frame data and produces encoded H.264 chunks.
- **mp4-mux**: A small JavaScript library that takes encoded video chunks and writes them into an MP4 container file.
- **Meta.json**: A sidecar file exported with PNG frames, containing timing info (fps, frame count, duration, section boundaries) so an external encoder can reconstruct the video.

## Plan of Work

### Milestone 1: Frame Renderer — Off-Screen Three.js Scene Setup

Create `modules/ClipRenderer.js` — an off-screen Three.js rendering setup that can produce individual frames.

This module creates a separate `WebGLRenderer` with a target resolution (e.g., 1920x1080, configurable). It shares the same `StitchAtlas` texture as the main viewport but has its own scene, camera, and stitch instances. It does not affect the visible canvas.

The renderer accepts a "frame state" — which groups are visible, what color each group is (for blink effects), opacity per group — and produces a single rendered frame as an `ImageBitmap` or canvas pixel data.

Key design: the off-screen renderer does not play a video. It only renders stitches on a transparent (or configurable) background. The video is the teaching video — the stitch overlay is what we're generating.

Methods:
- `setup(stitchStore, stitchAtlas, resolution)` — initialize off-screen renderer
- `renderFrame(frameState)` — render one frame and return pixel data
- `dispose()` — clean up WebGL resources

Where `frameState` is:

```javascript
{
  groups: {
    [groupId]: {
      visible: boolean,
      color: string,       // current color (may alternate for blink)
      opacity: number      // 0-1
    }
  }
}
```

Validation: create a ClipRenderer, call `renderFrame` with group 1 visible, verify it produces an image with the correct stitches rendered.

### Milestone 2: Recipe Interpreter — Grid to Frame States

Create `modules/RecipeInterpreter.js` — translates the clip recipe grid into a sequence of frame states.

Given:
- The clip recipe (2D grid of effects)
- The sections (array of `{start, end}` time ranges)
- A target FPS (e.g., 30)

The interpreter computes the total number of frames and, for each frame, determines the frame state: which groups are visible and what animation state they're in.

For each frame at time `t`:
1. Determine which section `t` falls in.
2. For each group, look up the cell at `[groupIndex][sectionIndex]`.
3. Based on the effect:
   - `null` — group not visible
   - `show` — group visible, static, using set color
   - `blink` — group visible, color alternates between color1 and color2 at the configured speed. The blink phase is computed from `t` and the blink speed.

The interpreter can either pre-compute all frame states (for small clips) or compute on-demand per frame (for large clips to save memory).

Methods:
- `constructor(clipRecipe, sections, fps)`
- `getTotalFrames()` — total frame count
- `getFrameState(frameIndex)` — returns frameState for that frame
- `getDuration()` — total duration in seconds

Validation: create an interpreter with a recipe that has Group 1 blinking in section 2. Query frame states across section 2's time range. Verify the blink color alternates at the configured speed.

### Milestone 3: WebCodecs Encoding Pipeline

Create `modules/ClipEncoder.js` — orchestrates the full pipeline: render each frame, encode with WebCodecs, mux into MP4, produce downloadable file.

The pipeline:

```
for each frame (0 to totalFrames):
  frameState = interpreter.getFrameState(frameIndex)
  pixelData = clipRenderer.renderFrame(frameState)
  videoFrame = new VideoFrame(pixelData, {timestamp, duration})
  videoEncoder.encode(videoFrame)
  videoFrame.close()

await videoEncoder.flush()
mp4muxer.finalize() → Blob → download
```

The `VideoEncoder` is configured for H.264 encoding at the target resolution and FPS. The `mp4-mux` library (imported as ES module or inline) collects encoded chunks and produces the final MP4 blob.

**Transparent background support**: If the user wants transparent output, use VP9 with alpha (WebM). If opaque, use H.264 (MP4). This is a user toggle.

Progress reporting: emit events or call a callback with `{currentFrame, totalFrames, percent}` so the UI can show a progress bar.

Cancellation: a cancel flag that stops the render loop. Clean up partial resources.

Methods:
- `constructor(clipRenderer, recipeInterpreter, options)`
- `async generate(onProgress, onComplete, onError)` — runs the pipeline
- `cancel()` — stops generation
- `isWebCodecsSupported()` — static method, checks browser support

The mp4-mux library: use `mp4-mux` (https://github.com/nickytonline/mp4-mux or similar). It's a small library (~10-20KB) that accepts encoded video chunks from WebCodecs and outputs an MP4 file. Include it as a local JS file (no CDN dependency) in a `lib/` folder.

Validation: generate a 5-second test clip with 2 groups (one Show, one Blink). Verify the output MP4 plays in a video player with correct timing and animation.

### Milestone 4: PNG Fallback Export

Add a fallback path in `ClipEncoder.js` for browsers without WebCodecs.

Instead of encoding, the pipeline:
1. Renders each frame as before.
2. Exports each frame as a PNG blob (via `canvas.toBlob('image/png')`).
3. Collects all PNGs into a zip file (using a small JS zip library, or exports individually).
4. Generates `meta.json`:

```json
{
  "fps": 30,
  "frameCount": 300,
  "duration": 10.0,
  "resolution": {"width": 1920, "height": 1080},
  "sections": [
    {"index": 0, "start": 0.0, "end": 3.0, "startFrame": 0, "endFrame": 89},
    {"index": 1, "start": 3.0, "end": 6.0, "startFrame": 90, "endFrame": 179}
  ]
}
```

5. Downloads the zip (or folder of PNGs + meta.json).

The user then runs ffmpeg externally:
```
ffmpeg -framerate 30 -i %03d.png -c:v libx264 -pix_fmt yuv420p output.mp4
```

The meta.json includes this command as a convenience.

Validation: on a browser without WebCodecs (or by forcing the fallback), generate a clip. Verify numbered PNGs and meta.json are exported. Run the ffmpeg command — verify the output video matches expectations.

### Milestone 5: Generate UI — Button, Progress, Cancel, Download

Add UI controls for clip generation to the ClipBuilderPanel or as a separate small panel/modal.

Elements:
- **Generate Clip button**: starts generation. Disabled if no recipe cells are filled.
- **Resolution selector**: dropdown (720p, 1080p, 4K) or custom input.
- **FPS selector**: 24, 30, 60 (default 30).
- **Background toggle**: transparent (WebM/VP9) or solid color (MP4/H.264).
- **Progress bar**: shows during generation. Displays frame count ("Rendering frame 150/300...") and percentage.
- **Cancel button**: appears during generation, stops the pipeline.
- **Download link**: appears when generation completes. Click to download the file.

If WebCodecs is not supported, the UI shows "PNG Export" instead of "Generate Clip" and adjusts labels accordingly.

Validation: click Generate. Progress bar fills. Cancel mid-way — generation stops, resources cleaned up. Let it complete — download link appears. Click download — file saves correctly.

### Milestone 6: Animation Effects — Blink, Show, and Extensible Effect System

Implement the actual animation effects that the RecipeInterpreter translates into frame states.

**Show effect:**
- Group is visible with its set color at full opacity.
- Static — no animation.
- Frame state: `{visible: true, color: setColor, opacity: 1.0}`

**Blink effect:**
- Group alternates between two colors at a configured speed.
- Blink speed is in flashes per second (e.g., 2 = one full cycle per 0.5 seconds).
- The blink function: `color = (sin(2 * PI * speed * t) > 0) ? color1 : color2`
- Frame state: `{visible: true, color: currentBlinkColor, opacity: 1.0}`
- Config: `{speed: number, color1: string, color2: string}`

**Extensibility:**
- Effects are registered in a map: `effectName → effectFunction(t, sectionStart, config) → frameState`.
- Adding a new effect = adding a new function to the map and adding it to the cell cycle order in ClipBuilderPanel.
- Future effects (walk-forward, fade-in, pulse) follow the same pattern.

Validation: generate a clip with mixed Show and Blink cells. Verify Show groups are static and Blink groups alternate colors at the configured speed in the output video.

## Concrete Steps

Working directory for all commands: `D:\Python\vdz2`

1. Source or create `lib/mp4-mux.js` — the MP4 muxer library for WebCodecs output.
2. Create `modules/ClipRenderer.js` — off-screen Three.js frame renderer.
3. Create `modules/RecipeInterpreter.js` — translates recipe grid to per-frame states.
4. Create `modules/ClipEncoder.js` — WebCodecs pipeline + PNG fallback.
5. Add generate UI controls to ClipBuilderPanel or a new GeneratePanel.
6. Wire into `vdzffedit-app.js` — connect generate button to encoder pipeline.
7. Implement blink animation math in RecipeInterpreter.
8. Test end-to-end: build recipe → generate → download → play.
9. Test PNG fallback: force fallback mode → export PNGs + meta.json → verify.
10. Test on iPad Safari (or emulation): WebCodecs encoding works, download works.

## Validation and Acceptance

1. **End-to-end generation**: Build a recipe with 3 groups across 4 sections (mix of Show, Blink, empty). Click Generate. Progress bar shows. Download completes. Play the MP4 — groups appear and animate correctly per the recipe.

2. **Blink animation**: A Blink cell with speed=2, color1=red, color2=white produces a group that flashes between red and white twice per second in the output video.

3. **Transparent background**: Toggle transparent mode. Generate. The output (WebM) has an alpha channel — groups render over transparency.

4. **PNG fallback**: On a browser without WebCodecs (or forced), generate exports numbered PNGs and meta.json. The ffmpeg command in meta.json produces a correct video.

5. **Cancel**: Start generation, cancel mid-way. No download produced. No resource leaks (WebGL context, encoder closed).

6. **Large clip**: Generate a 60-second clip at 1080p/30fps (1800 frames). Verify it completes without crashing or running out of memory. Progress bar updates smoothly.

7. **Cross-platform**: Generate a clip on iPad Safari. WebCodecs encodes and download works.

## Idempotence and Recovery

All changes are additive — new files in `modules/` and `lib/`. No existing files are deleted. If generation fails mid-way, the encoder cleans up its WebGL context and VideoEncoder. Re-running generation starts fresh.

The mp4-mux library is a local file (not CDN), so no network dependency during generation.

## Interfaces and Dependencies

### New files:

**`modules/ClipRenderer.js`**

```javascript
export default class ClipRenderer {
  constructor()
  setup(stitchStore, stitchAtlas, resolution)
  renderFrame(frameState)    // returns canvas or ImageBitmap
  dispose()
}
```

**`modules/RecipeInterpreter.js`**

```javascript
export default class RecipeInterpreter {
  constructor(clipRecipe, sections, fps)
  getTotalFrames()
  getFrameState(frameIndex)  // returns {groups: {[id]: {visible, color, opacity}}}
  getDuration()
}
```

**`modules/ClipEncoder.js`**

```javascript
export default class ClipEncoder {
  constructor(clipRenderer, recipeInterpreter, options)
  async generate(onProgress, onComplete, onError)
  cancel()
  static isWebCodecsSupported()
}
```

**`lib/mp4-mux.js`** — MP4 muxer library (sourced externally, included locally).

### Dependencies on existing modules:

- `modules/ClipRecipe.js` (Phase 7) — reads the recipe grid
- `modules/StitchStore.js` — reads stitch positions/properties for rendering
- `modules/StitchAtlas.js` — texture atlas for stitch symbols
- `modules/SetManager.js` — reads group colors and properties
- `ui/VideoZone.js` — reads sections for timing
- `core/EventBus.js` — progress/completion events

### External dependency:

- `mp4-mux` — small JS library for MP4 container muxing. Included as a local file in `lib/`. No CDN, no npm. Loaded via import map or direct import.

## Artifacts and Notes

Example ffmpeg command for PNG fallback (included in meta.json):

```bash
ffmpeg -framerate 30 -i frames/%03d.png -c:v libx264 -pix_fmt yuv420p output.mp4
```

For transparent output:

```bash
ffmpeg -framerate 30 -i frames/%03d.png -c:v libvpx-vp9 -pix_fmt yuva420p output.webm
```
