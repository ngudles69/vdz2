# Freeform Editor — Requirements

## Overview

A lightweight, fast freeform stitch placement editor as a **new standalone project**. The user imports a reference image, places stitch symbols quickly using a stamp/paint workflow, and exports transparent PNGs for use in PDF instruction guides and as input for video generation.

**Core principle:** Speed. Open the editor, align ruler, stamp stitches row by row, tweak, export. Under a minute for simple patterns. The tool gets out of the way.

**Tech stack:** Three.js (single rendering library for everything), vanilla JS + ES modules. React/Remotion added later for video generation only.

**Reference:** See ss1.jpg through ss5.jpg in the original VDZ repo — these show the target output: a crochet stitch diagram built up in colored layers as a transparent overlay on a teaching video.

---

## Layers (bottom to top)

1. **Background layer** — flat color workspace backdrop (minor feature)
2. **Image layer** — imported reference photo used as a tracing guide
3. **Quantization layer** — TBD
4. **Stitches layer** — all placed stitch symbols

---

## Stitch Picker UI

- **Minimalist icon display** — each stitch shown as its symbol with a tiny abbreviation below (e.g. "ch", "sc", "dc")
- All icons on transparent backgrounds
- Clicking a stitch highlights it / lights up as the active selection
- **Preview window** above the picker showing the selected stitch enlarged (like a selected-color swatch)
- User can set rotation on the preview (freeform angle) — all subsequent stamps inherit that rotation
- Ability to switch between: symbol only, abbreviation only, or both
- Think of it like a character/brush palette in a drawing app

---

## Stitch Placement

### Stamp/Paint Workflow (like Chinese characters)
- Pick a stitch from the picker
- Click to place one stitch at a time ("stamp")
- Each stamp snaps to ruler/grid (if snapping is on) or places freely (if snapping is off)
- Rotation from the preview is auto-applied to each stamped stitch
- Workflow: pick stitch → stamp a row → pick another stitch → stamp another row → repeat
- Add individual stitches at arbitrary positions (start/end of rows, any random spot)

### Rotation
- Set rotation on the stitch preview — auto-applied to all subsequent stamps
- Click individual placed stitches to rotate them independently after placement
- Select a group → rotate the group

### Manipulation
- Click to select individual stitches
- Nudge/move individual stitches
- Move groups of stitches
- Typical stitch count: could be fewer than 10, up to maybe 50-60

---

## Sets & Sequencing

### Set Assignment
- Select one or more stitches → type a number → they become that set (e.g. select 5 stitches, press "1", they're set 1)
- **Single set per stitch** — no multi-group (avoids ambiguity in sequencing and animation)
- Visual indicator showing which set each stitch belongs to (color-coded, number label, or both)

### Sequence Control
- Define the order of stitches *within* a set (the walk-forward order for animation)
- Reorder sets themselves (set 1 can become set 3, etc.)

### Coloring
- Apply a display color to an entire set
- Override color on individual stitches within a set
- Each set can have a blink color pair (for animation: flashes between two colors)

---

## Export — Primary Focus (Phase 1)

### Transparent PNGs
All exports have transparent backgrounds with stitches at their exact canvas positions.

1. **Full pattern PNG** — all stitches visible, final form
2. **Per-set cumulative PNGs** — progressive build-up:
   - Set 1 only
   - Sets 1 + 2
   - Sets 1 + 2 + 3
   - ... up to full pattern
3. **Individual set PNGs** — each set isolated (for individual overlays)

### Use Cases
- Insert into PDF instruction guides
- Use as transparent overlays in video editing (CapCut)
- Feed into Remotion for animated video generation

---

## Export — Video Generation (Phase 2, future)

### Option A: Individual Loopable Clips (best for few sets, ~4-5)
- Each set exported as a seamless looping transparent video clip (~10 sec default)
- Each clip shows: all previous sets static + current set blinking/animating
- Final static PNG for the hold at the end
- User lays clips sequentially on CapCut timeline, trims each to match narration
- Simple, no sync tool needed

### Option B: Sync Page with Bookmarked Timestamps (best for many sets, 10-20+)
- **Separate page/tool** (not crammed into the editor)
- Load the source teaching video in a player
- Load the stitch project (positions, sets, colors)
- Scrub through video, tap a key at each set transition → bookmark created
- Can adjust bookmarks manually
- Tool renders one complete transparent overlay video with all timing baked in
- Drop single overlay clip onto source video in CapCut — already synced
- **Keep it simple** — not a video editor, just a sync/bookmark tool for fast work

### Option C: AI-Generated Remotion (best for one-offs / unusual animations)
- Export stitch data as JSON (positions, sets, colors, sequence)
- Describe timing/animation verbally to Claude
- Claude generates Remotion composition code
- Render and use
- Fallback for custom requests the tools don't cover

### Animation Features (all video options)
- **Set blinking**: flash between two configurable colors for a duration
- **Walk-forward**: stitches within a set appear one by one (like captions typing in)
- Walk-forward can repeat/loop until transitioning to next set
- Previous sets remain visible but stop animating after their turn
- Transparent background (WebM with alpha or ProRes 4444 for Apple)

---

## Architecture Decisions

- **New standalone repo** — clean slate, no legacy mesh editor coupling
- **Three.js as the single rendering library** — used for the editor canvas, PNG export, and eventually video frame rendering
- **Vanilla JS + ES modules** — no framework for the editor itself
- **React/Remotion added later** — only for video generation (Phase 2), as a separate entry point
- **Stitch definitions as shared data** — the StitchLibrary (definitions + Canvas2D draw functions) and StitchAtlas (texture generation) are copied from the original VDZ repo and serve as the foundation
- **No mesh/graph topology** — stitches are independent positioned objects, not edge attributes on a graph
- **Export-first design** — the data model should make PNG/JSON export trivial
