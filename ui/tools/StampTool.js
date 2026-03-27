import { Tool } from './Tool.js';

/**
 * StampTool — Click to place a stitch at the cursor position.
 *
 * Uses the active stitch from StitchPicker, with its rotation, color,
 * and opacity settings. Snaps to grid when grid is visible.
 */
class StampTool extends Tool {
  id = 'stamp';
  label = 'Stamp';

  /** @type {Function|null} PlaceStampCommand class reference */
  #PlaceStampCommand = null;

  /**
   * @param {Function} PlaceStampCommand - Command class for placing stamps
   */
  constructor(PlaceStampCommand) {
    super();
    this.#PlaceStampCommand = PlaceStampCommand;
  }

  onActivate() {
    // Deselect any current selection when switching to stamp mode
    this.selection?.deselectAll();
  }

  #tappedOnStitch = false;
  #transformDragging = false;
  #boxStart = null;
  #boxDragging = false;

  onPointerDown(wp, e) {
    // Block all interaction when stitches layer is locked
    if (this.stitchesLocked) return false;

    // 1. Check transform handles first (when selection is active)
    if (this.transform?.visible) {
      const handle = this.transform.hitTest(wp);
      if (handle) {
        this.transform.startDrag(handle, wp);
        this.#transformDragging = true;
        this.manager.disableControls();
        return true;
      }
    }

    // 2. Check if clicking on an existing stitch — select it instead of stamping
    const hitId = this.renderer?.hitTest(wp);
    if (hitId) {
      this.selection.select(hitId, e.shiftKey);
      // Set stitch transform target
      const target = this.manager?.stitchTarget;
      if (target && this.transform) {
        this.transform.setTarget(target);
      }
      this.#tappedOnStitch = true;
      return true;
    }

    // 3. Empty space — could be stamp (tap) or box select (drag)
    this.#boxStart = { x: e.clientX, y: e.clientY };
    this.manager.disableControls();
    this.#tappedOnStitch = false;
    this.#transformDragging = false;
    return true;
  }

  onPointerMove(wp, e) {
    if (this.#transformDragging) {
      const grid = this.grid;
      this.transform.updateDrag(wp, grid.visible, grid.spacing);
      return;
    }

    // Box select drag
    if (this.#boxStart) {
      const dx = e.clientX - this.#boxStart.x;
      const dy = e.clientY - this.#boxStart.y;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        this.#boxDragging = true;
        const rect = document.getElementById('box-select-rect');
        if (rect) {
          const container = this.manager.viewport.container.getBoundingClientRect();
          const sx = this.#boxStart.x - container.left;
          const sy = this.#boxStart.y - container.top;
          const cx = e.clientX - container.left;
          const cy = e.clientY - container.top;
          rect.style.left = `${Math.min(sx, cx)}px`;
          rect.style.top = `${Math.min(sy, cy)}px`;
          rect.style.width = `${Math.abs(cx - sx)}px`;
          rect.style.height = `${Math.abs(cy - sy)}px`;
          rect.style.display = 'block';
        }
      }
    }
  }

  onPointerUp(wp, e) {
    // Transform drag end
    if (this.#transformDragging) {
      this.#commitTransform();
      this.#transformDragging = false;
      this.manager.enableControls();
      return;
    }

    // Box select end
    if (this.#boxDragging && this.#boxStart) {
      const vp = this.manager.viewport;
      const wp1 = vp.screenToWorld(this.#boxStart.x, this.#boxStart.y);
      const wp2 = vp.screenToWorld(e.clientX, e.clientY);
      const ids = this.renderer?.getStampsInRect(wp1.x, wp1.y, wp2.x, wp2.y) || [];
      if (ids.length > 0) {
        this.selection.selectMultiple(ids, e.shiftKey);
        const target = this.manager?.stitchTarget;
        if (target && this.transform) this.transform.setTarget(target);
      }
      this.#boxStart = null;
      this.#boxDragging = false;
      const rect = document.getElementById('box-select-rect');
      if (rect) rect.style.display = 'none';
      this.manager.enableControls();
      return;
    }
    if (this.#boxStart) {
      this.#boxStart = null;
      this.manager.enableControls();
    }

    // If we selected a stitch on pointerdown, don't stamp
    if (this.#tappedOnStitch) {
      this.#tappedOnStitch = false;
      return;
    }

    const picker = this.manager?.stitchPicker;
    if (!picker) return;

    const stitchId = picker.getActiveStitchId();
    if (!stitchId) return;

    // If there's a selection, deselect first (tap on empty = deselect, not stamp)
    if (this.selection?.hasSelection) {
      this.selection.deselectAll();
      return;
    }

    // Snap to grid
    const snapped = this.snapToGrid(wp);
    const gridLink = this.state?.get('gridLink') ?? false;

    const data = {
      type: 'stitch',
      stitchType: stitchId,
      position: snapped,
      rotation: -(picker.getRotation() || 0) * Math.PI / 180,
      colorOverride: picker.getStampColor(),
      opacity: picker.getStampOpacity(),
      gridSnapped: this.grid.visible,
      gridLinked: gridLink && this.grid.visible,
      gridCoords: (gridLink && this.grid.visible)
        ? { x: snapped.x / this.grid.spacing, y: snapped.y / this.grid.spacing }
        : null,
    };

    this.history.execute(new this.#PlaceStampCommand(this.store, data));
  }

  getCursor() {
    if (this.transform?.visible) {
      // Can't easily check hover here without wp, so keep crosshair
    }
    return 'crosshair';
  }

  #commitTransform() {
    const result = this.transform.endDrag();
    if (!result || !this.history) return;

    const store = this.store;
    const moves = result.moves || [];
    const rotations = result.rotations || [];
    const scales = result.scales || [];

    const cmd = {
      _first: true,
      execute() {
        if (this._first) { this._first = false; return; }
        if (moves.length) store.batchUpdate(moves.map(m => ({ id: m.id, props: { position: m.newPos } })));
        if (rotations.length) store.batchUpdate(rotations.map(r => ({ id: r.id, props: { rotation: r.newRot } })));
        if (scales.length) store.batchUpdate(scales.map(s => ({ id: s.id, props: { scale: s.newScale } })));
      },
      undo() {
        if (moves.length) store.batchUpdate(moves.map(m => ({ id: m.id, props: { position: m.oldPos } })));
        if (rotations.length) store.batchUpdate(rotations.map(r => ({ id: r.id, props: { rotation: r.oldRot } })));
        if (scales.length) store.batchUpdate(scales.map(s => ({ id: s.id, props: { scale: s.oldScale } })));
      },
      get description() { return 'Transform stamps'; },
    };
    this.history.execute(cmd);
  }
}

export { StampTool };
