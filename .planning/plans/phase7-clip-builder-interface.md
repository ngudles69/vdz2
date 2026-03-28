# Phase 7: Clip Builder Interface

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds. This document must be maintained in accordance with `.planning/EXECPLAN.md`.

## Purpose / Big Picture

After this phase, the user can build a visual "clip recipe" — a grid that maps stitch groups to video sections and defines what animation plays in each cell. This recipe is the input for Phase 8 (Clip Generator), which renders the final video.

The user loads a teaching video, places bookmarks to define sections, then opens the Clip Builder grid. Rows are groups (stitch sets), columns are sections (time ranges between bookmarks). The user clicks cells to assign effects (Show, Blink, future effects), double-clicks effect icons to configure them (speed, color), and can copy/paste cells to build patterns quickly. The grid saves/loads as part of the project JSON. The entire interface works on desktop, iPad, and phone with a single responsive layout.

To see it working: load a video, place bookmarks, open the clip builder panel. A grid appears with group rows and section columns. Double-click a cell to cycle through effects. Select cells, Ctrl+C, click target, Ctrl+V. Save the project — the grid data persists. Reload — the grid restores.

## Progress

- [ ] Milestone 1: Grid data model and serialization
- [ ] Milestone 2: Grid UI — rendering, cell states, section headers
- [ ] Milestone 3: Cell interaction — selection, double-click cycling, effect icons
- [ ] Milestone 4: Effect configuration popups
- [ ] Milestone 5: Copy/paste and bulk operations
- [ ] Milestone 6: Video-bookmark integration and edge cases
- [ ] Milestone 7: Responsive design and touch support

## Surprises & Discoveries

(None yet.)

## Decision Log

- Decision: Grid data keyed by column index, not by time position.
  Rationale: When bookmarks change (add/delete/move), the grid data stays as-is. Section numbers are stable. The user manages cleanup themselves (clear all, clear rows, clear columns, clear selected cells). This avoids complex data migration when bookmarks shift. Discussed and confirmed by user.
  Date: 2026-03-28

- Decision: No auto-cumulative fill. Each cell is independent.
  Rationale: The user manually controls every cell. If Group 1 has "Show" in section 3 but blank in section 4, it does not show in section 4. The user creates the pattern, not the system. This gives full control for scenarios like turning off all groups in an ending section.
  Date: 2026-03-28

- Decision: No React/Remotion. WebCodecs + Three.js for video generation.
  Rationale: Must run on iPad/iPhone/Android in the browser. No native code, no Node.js. WebCodecs is browser-built-in and hardware-accelerated. Fallback is PNG frame export.
  Date: 2026-03-28

- Decision: Cell states cycle on double-click (blank → Show → Blink → blank).
  Rationale: Simple, fast interaction. Click selects, double-click changes state. No dropdowns or menus needed for basic use.
  Date: 2026-03-28

- Decision: Effects are extensible. Blink is the first animation effect, more can be added later.
  Rationale: The effect system should support adding new animation types without restructuring the grid or data model.
  Date: 2026-03-28

## Outcomes & Retrospective

(Not yet started.)

## Context and Orientation

The project is a crochet stitch diagram editor built with Three.js + vanilla JS. The relevant existing modules are:

- `ui/VideoZone.js` (~560 lines) — manages video playback, filmstrip timeline, and bookmarks. Key properties: `bookmarks` (array of timestamps in seconds), `sections` (derived array of `{start, end}` objects computed from bookmarks), `hasSelectedBookmark`. Emits events: `video:bookmark-added`, `video:bookmark-removed`, `video:bookmarks-changed`, `video:loaded`, `video:unloaded`, `video:timeupdate`.

- `modules/SetManager.js` — manages numbered stitch groups (1-9+). Each set has an id, color, blink color, and visibility state. Provides `getSets()`, `getSet(id)`, and persistence methods.

- `modules/StitchStore.js` — data store for all placed stamps. Provides `exportJSON()` and `importJSON()` for project save/load.

- `modules/StitchRenderer.js` — InstancedMesh rendering. Manages visibility of stitches based on set membership.

- `vdzffedit-app.js` — entry point that wires all modules together. New modules are instantiated here and connected via EventBus.

- `core/EventBus.js` — pub/sub message bus used for all inter-module communication.

The Clip Builder Interface is a new module that sits between the video/bookmark system and the future clip generator. It reads bookmark sections and stitch groups, and produces a "clip recipe" — a 2D grid of effect assignments.

### Key terms

- **Section**: A time range between two consecutive bookmarks (or video start/end). If there are 4 bookmarks in a video, there are 5 sections.
- **Group**: A numbered stitch set (Group 1, Group 2, etc.) as managed by SetManager.
- **Cell**: One intersection in the grid — a specific group in a specific section. Contains an effect assignment or is empty.
- **Effect**: What happens to a group during a section. Current effects: "show" (static display), "blink" (flash animation). Each effect has configurable parameters.
- **Clip recipe**: The complete grid data — all cell assignments, effect configs, video reference, and metadata. This is what Phase 8 consumes to render frames.

## Plan of Work

### Milestone 1: Grid Data Model and Serialization

Create `modules/ClipRecipe.js` — a pure data class with no UI. This holds the 2D grid of effect assignments and handles save/load.

The data structure is a 2D array indexed by `[groupIndex][sectionIndex]`. Each cell is either `null` (empty) or an object:

```javascript
{
  effect: 'show' | 'blink',   // effect type
  config: {                    // effect-specific parameters
    // for 'show': (none currently, reserved for future)
    // for 'blink': { speed: number, color1: string, color2: string }
  }
}
```

The grid dimensions are dynamic. The data array grows as needed — accessing a cell beyond current bounds returns `null`. A configurable max dimension limits the visual grid (default 40 columns x 30 rows, user-adjustable, system max TBD based on screen testing).

ClipRecipe also stores video reference metadata:

```javascript
{
  videoName: string | null,     // filename of the loaded video
  videoPath: string | null,     // path if available
  grid: Array<Array<CellData>> // [groupIndex][sectionIndex]
}
```

Methods:
- `getCell(groupIndex, sectionIndex)` — returns cell data or null
- `setCell(groupIndex, sectionIndex, data)` — sets cell data
- `clearCell(groupIndex, sectionIndex)` — sets cell to null
- `clearRow(groupIndex)` — clears all cells in a group row
- `clearColumn(sectionIndex)` — clears all cells in a section column
- `clearAll()` — resets entire grid
- `exportJSON()` — serializes for project save
- `importJSON(data)` — deserializes from project load
- `getGridDimensions()` — returns `{rows, cols}` of current data extent

Serialization format integrates with the existing project JSON. When the project is saved (StitchStore.exportJSON), the clip recipe is included as a `clipRecipe` key. When loading, if `clipRecipe` is missing, the grid stays blank (default).

Video reference: `videoName` and `videoPath` are stored. On load, the app shows the video name. If the user loads a video with the same name, great. If they load a different video, the name is overridden. Bookmarks and sections keep their time positions regardless.

Validation: after this milestone, you can create a ClipRecipe in the browser console, set cells, export to JSON, import from JSON, and verify the data round-trips correctly.

### Milestone 2: Grid UI — Rendering, Cell States, Section Headers

Create `ui/ClipBuilderPanel.js` — the visual grid panel. This renders as an HTML table inside a scrollable container. The panel can be toggled open/closed (like the existing stitch picker and layer panel).

The grid layout matches the reference screenshot (`ss/ss42.jpg`):

```
          | Section 1    | Section 2    | Section 3    | ... | ACTIONS
          | 00:00-00:03  | 00:03-00:06  | 00:06-00:09  | ... |
----------+--------------+--------------+--------------+-----+-----------
Group 1   | [cell]       | [cell]       | [cell]       | ... | Show All | Hide All
Group 2   | [cell]       | [cell]       | [cell]       | ... | Show All | Hide All
...
```

Column headers show the section number and time range. Time ranges come from VideoZone's `sections` property. If no video is loaded, columns show section numbers only (no time ranges). The number of columns matches the number of sections (derived from bookmarks).

Row headers show "Group N" with the group's color from SetManager. Rows without assigned stitches are greyed out (dimmed) but still interactive.

The rightmost column has "Show All | Hide All" action links per row:
- "Show All" sets every cell in that row to `{effect: 'show', config: {}}`.
- "Hide All" clears every cell in that row to `null`.

The table container has `overflow: auto` for both horizontal and vertical scrolling. The row header column and the column header row are sticky (CSS `position: sticky`) so they remain visible while scrolling.

Cells are `<td>` elements with a minimum size of 44px x 44px (touch target). Each cell displays:
- Empty: no content, default background.
- Show: an icon (a simple eye or visibility symbol) with the group's color as background tint. Tiny label "Show" below the icon.
- Blink: an icon (a flash/sparkle symbol) with the group's color as background tint. Tiny label "Blink" below the icon.

Display mode toggle (like the stitch picker): icon+words, icon only, words only. Default is icon+words.

The panel is wired into `vdzffedit-app.js` with a toolbar button or keyboard shortcut to toggle visibility.

Validation: open the panel, see the grid with correct sections and groups. Cells are empty. Section headers show time ranges from loaded video. Greyed-out rows for groups with no stitches.

### Milestone 3: Cell Interaction — Selection, Double-Click Cycling, Effect Icons

Add interaction to grid cells:

**Click** = select the cell. A selected cell gets a visible highlight border (e.g., 2px solid blue). Only one cell selected at a time by default.

**Multi-select**:
- Shift+click = select range (rectangular block from last selected to clicked cell).
- Ctrl+click = toggle individual cell in/out of selection.
- Click+drag = select rectangular range.

**Double-click** = cycle the cell's effect state: `null → 'show' → 'blink' → null`. Each double-click advances to the next state. The cell's icon and label update immediately.

**Delete/Backspace** = clear selected cells (set to null).

The selection state is managed by ClipBuilderPanel internally — an array of `{groupIndex, sectionIndex}` pairs. Selection highlight is a CSS class toggled on the `<td>` elements.

Effect icons are simple inline SVGs or Unicode symbols rendered inside the cell. Each effect type defines its icon and label:
- Show: eye icon, label "Show"
- Blink: flash icon, label "Blink"
- Future effects: add to the cycle order and define icon/label.

Validation: click cells to select (highlight visible). Double-click to cycle through blank → Show → Blink → blank. Select multiple cells with Shift+click. Press Delete to clear. Icons and labels render correctly in each state.

### Milestone 4: Effect Configuration Popups

Double-clicking on an effect's icon/label (when the cell already has that effect) opens a small popup anchored to the cell. The popup contains effect-specific configuration controls.

**Blink config popup:**
- Blink speed: number input (flashes per second, default 2)
- Color 1: color picker (default: group's set color)
- Color 2: color picker (default: white or a contrast color)
- Apply to selection: if multiple cells are selected, option to apply config to all selected blink cells

**Show config popup:**
- Currently minimal (reserved for future parameters like opacity)
- May just show "Static display — no animation"

The popup is a small absolutely-positioned div, similar to the layer config modals in `ui/LayerPanel.js`. It closes when clicking outside, pressing Escape, or clicking a "Done" button.

When config is changed, the cell's `config` object is updated in ClipRecipe immediately.

Implementation note: distinguish between "double-click to cycle state" and "double-click to configure." The interaction is: double-click an empty cell cycles to Show. Double-click a Show cell cycles to Blink. Double-click a Blink cell cycles to blank. To configure an existing effect, the user clicks the effect icon specifically (or we use a right-click / long-press context menu). Alternative: a small gear icon appears on hover/selection that opens config. Choose the simplest approach during implementation.

Validation: assign Blink to a cell, open config popup, change speed and colors, verify the config persists in ClipRecipe data. Save project, reload, verify config restored.

### Milestone 5: Copy/Paste and Bulk Operations

**Copy/paste:**
- Select one or more cells.
- Ctrl+C (or Cmd+C) copies the selected cells' data (effect + config) to an internal clipboard. The clipboard stores a 2D block of cell data, maintaining relative positions.
- Click a target cell (the paste anchor — top-left of where the block will land).
- Ctrl+V (or Cmd+V) pastes the copied block starting from the anchor. Cells that would land outside the grid bounds are ignored.
- The paste writes to ClipRecipe and re-renders affected cells.

**Bulk operations (per-row actions):**
- "Show All" button on a row: fills every cell in that row with `{effect: 'show', config: {}}`.
- "Hide All" button on a row: clears every cell in that row.
- These operate on ClipRecipe and re-render the row.

**Clear selected:**
- Delete/Backspace clears all selected cells.

The internal clipboard is a simple JS object — no system clipboard integration needed (cell data isn't meaningful as text).

Validation: select a 2x3 block of cells with effects configured, Ctrl+C, click a new anchor cell, Ctrl+V — the block appears in the new location with all effect configs preserved. "Show All" fills a row. "Hide All" clears it. Delete clears selected cells.

### Milestone 6: Video-Bookmark Integration and Edge Cases

Wire the ClipBuilderPanel to respond to VideoZone events and handle edge cases.

**Video loaded:**
- Store video name and path in ClipRecipe.
- Update section headers with time ranges from `videoZone.sections`.
- If video is longer than the last bookmark, the last section extends to the video's end.
- If video is shorter than some bookmarks, those bookmarks are marked red in the filmstrip (visual warning in VideoZone). The corresponding section columns show time ranges but are visually flagged (e.g., red-tinted header or strikethrough time).

**Bookmark exceeds video duration:**
- In VideoZone's filmstrip, bookmark markers that exceed the loaded video's duration are rendered in red instead of the normal purple.
- In ClipBuilderPanel, section columns for invalid time ranges get a red-tinted header.
- Cells in those columns are still interactive (the user might reload the correct video).

**Partial section validity:**
- If a section spans 00:19-00:30 but the video is only 21 seconds, the cell background shows a partial fill — the valid portion (00:19-00:21, roughly 18%) is normal, the rest is greyed/red-striped. This is a CSS gradient or a proportional overlay.

**Bookmark changes (add/delete/move):**
- Grid data stays as-is by column index. New columns are blank. Deleted columns remove that column's data and shift remaining columns down.
- Section headers re-read time ranges from VideoZone.
- A toast notification warns: "Bookmarks changed — review clip grid."

**Video unloaded:**
- Section headers lose time ranges (show section numbers only).
- Grid data preserved (user may reload a video).

**Video name mismatch:**
- On project load, ClipRecipe stores the video name. If the user loads a different video, the stored name is overridden. Bookmarks keep their time positions.

**Save/load integration:**
- ClipRecipe data is included in the project JSON under a `clipRecipe` key.
- If `clipRecipe` key is missing on load, the grid starts blank.
- Video name and path are saved. On load, the app shows the stored video name. If the stored path is accessible, it could auto-load (attempt only, not required — may not work on all platforms).

Validation: load a video, place bookmarks, fill grid cells, save project. Reload — grid restores. Load a shorter video — bookmarks beyond duration show red, partial cells show proportional fill. Add a bookmark — new column appears blank, existing data stays. Delete a bookmark — column removed, data shifts.

### Milestone 7: Responsive Design and Touch Support

Ensure the grid works on iPad, iPhone, and Android with a single layout.

**Touch interactions:**
- Tap = select cell (same as click)
- Double-tap = cycle effect state (same as double-click)
- Long-press = open effect config popup (same as right-click/gear icon)
- Touch-drag = select range of cells
- Two-finger scroll = scroll the grid container

**Cell sizing:**
- Minimum 44px x 44px for touch targets.
- On smaller screens, cells may be larger to improve usability.
- The grid container scrolls in both directions.

**Sticky headers:**
- Row headers (Group names) stick to the left edge during horizontal scroll.
- Column headers (Section numbers + times) stick to the top during vertical scroll.

**Panel layout:**
- On desktop: the clip builder panel appears as a panel (similar to existing panels — toggled, positioned).
- On mobile: same panel, full-width, scrollable grid inside.
- No separate mobile layout. Same HTML/CSS, responsive via container queries or media queries for padding/font adjustments only.

Validation: open the app on iPad Safari (or Chrome DevTools device emulation). Grid renders, cells are tappable, scrolling works, sticky headers stay visible, config popups position correctly within viewport.

## Concrete Steps

Working directory for all commands: `D:\Python\vdz2`

1. Create `modules/ClipRecipe.js` with the data model, getters/setters, and JSON serialization.
2. Create `ui/ClipBuilderPanel.js` with grid rendering, reading sections from VideoZone and groups from SetManager.
3. Add cell interaction: selection, double-click cycling, keyboard shortcuts (Delete to clear).
4. Add effect icons (inline SVGs) and display mode toggle.
5. Add effect config popups with per-effect controls.
6. Add copy/paste (internal clipboard, Ctrl+C/V).
7. Add "Show All / Hide All" row actions.
8. Wire into `vdzffedit-app.js`: instantiate, connect to EventBus, add toolbar toggle button.
9. Integrate with project save/load: add `clipRecipe` key to project JSON.
10. Wire VideoZone events: update headers on video load/unload, flag invalid bookmarks red.
11. Add partial fill rendering for sections exceeding video duration.
12. Add toast warnings for bookmark changes.
13. Add responsive CSS: sticky headers, min cell size, scroll container.
14. Test touch interactions on iPad/iPhone (or device emulation).

## Validation and Acceptance

1. **Grid renders correctly**: Open the clip builder panel. A grid appears with group rows and section columns. Section headers show time ranges when a video is loaded. Groups with no stitches are dimmed.

2. **Cell interaction works**: Click a cell — it highlights. Double-click — cycles through blank/Show/Blink. Icons and labels display correctly. Delete key clears selected cells.

3. **Multi-select and copy/paste**: Shift+click to select a range. Ctrl+C copies. Click new target. Ctrl+V pastes the block. Effects and configs are preserved.

4. **Effect configuration**: Assign Blink to a cell. Open config (long-press or gear icon). Change blink speed and colors. Save project, reload — config persists.

5. **Show All / Hide All**: Click "Show All" on Group 2's row — all cells in that row become Show. Click "Hide All" — all cells clear.

6. **Save/load round-trip**: Fill several cells with effects and configs. Save project. Close and reopen. Load project — grid restores exactly.

7. **Video edge cases**: Load a short video. Bookmarks beyond video duration show red markers. Partial sections show proportional fill. Add a bookmark — new blank column appears, existing data stays.

8. **Responsive**: Open in iPad emulation. Grid scrolls horizontally and vertically. Sticky headers work. Cells are tappable at 44px minimum. Config popups stay within viewport.

## Idempotence and Recovery

All changes are additive — new files (`ClipRecipe.js`, `ClipBuilderPanel.js`) and wiring in `vdzffedit-app.js`. No existing files are deleted or restructured. The plan can be re-run safely: creating the files again overwrites with the same content.

If the clip recipe data is corrupted in a saved project, the `importJSON` method should silently ignore malformed data and start with a blank grid (no crash, no error beyond a console warning).

## Interfaces and Dependencies

### New files:

**`modules/ClipRecipe.js`** — Pure data model, no DOM, no UI.

```javascript
export default class ClipRecipe {
  constructor()
  getCell(groupIndex, sectionIndex)        // returns {effect, config} | null
  setCell(groupIndex, sectionIndex, data)   // sets cell
  clearCell(groupIndex, sectionIndex)       // sets to null
  clearRow(groupIndex)                      // clears all cells in row
  clearColumn(sectionIndex)                 // clears all cells in column
  clearSelected(cells)                      // clears array of {groupIndex, sectionIndex}
  clearAll()                                // resets grid
  getCellBlock(cells)                       // returns 2D block for copy
  pasteCellBlock(anchor, block)             // writes block at anchor position
  getGridDimensions()                       // returns {rows, cols}
  setVideoReference(name, path)             // stores video info
  getVideoReference()                       // returns {name, path}
  exportJSON()                              // serializes
  importJSON(data)                          // deserializes
}
```

**`ui/ClipBuilderPanel.js`** — Grid UI panel.

```javascript
export default class ClipBuilderPanel {
  constructor(container, clipRecipe, eventBus)
  show() / hide() / toggle()
  refresh()                                 // re-render grid from data
  setDisplayMode(mode)                      // 'icon-words' | 'icon' | 'words'
}
```

### Dependencies on existing modules:

- `core/EventBus.js` — listens for video and bookmark events
- `modules/SetManager.js` — reads group info (names, colors)
- `ui/VideoZone.js` — reads `sections` and `bookmarks` properties, listens for events
- `modules/StitchStore.js` — integration point for project save/load (adds `clipRecipe` to JSON)

### Events consumed:

- `video:loaded` — update section headers, store video reference
- `video:unloaded` — clear time ranges from headers
- `video:bookmark-added` — add column, show toast
- `video:bookmark-removed` — remove column, show toast
- `video:bookmarks-changed` — refresh section headers
- `video:timeupdate` — optional: highlight current section column

### Events emitted:

- `clipbuilder:cell-changed` — when a cell effect is set/cleared
- `clipbuilder:recipe-changed` — when any grid data changes (for auto-save)

## Artifacts and Notes

Reference screenshot: `ss/ss42.jpg` — shows the target grid layout with sections as columns, groups as rows, Blink/Show cells with colored backgrounds, and Show All/Hide All actions per row.
