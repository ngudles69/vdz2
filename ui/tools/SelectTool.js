import { Tool } from './Tool.js';

/**
 * SelectTool — Click select, shift-click, box select, transform handles,
 * and image overlay interaction.
 *
 * This is the default tool. Priority order on click:
 * 1. Transform handles (move/resize/rotate selected stamps)
 * 2. Stamp hit test (select a stamp)
 * 3. Image overlay handles (resize image)
 * 4. Image overlay body (drag image)
 * 5. Empty space → box select or deselect
 */
class SelectTool extends Tool {
  id = 'select';
  label = 'Select';

  #isDragging = false;
  #dragType = null;    // 'transform' | 'box' | 'image-drag' | 'image-resize' | null
  #boxStart = null;
  #cursor = 'default';

  onActivate() {
    this.#cursor = 'default';
  }

  onDeactivate() {
    this.#endBoxSelect();
    this.#isDragging = false;
    this.#dragType = null;
  }

  /** @returns {import('../../modules/ImageOverlay.js').ImageOverlay|null} */
  get #imageOverlay() { return this.manager?.imageOverlay ?? null; }

  /** @returns {import('../../modules/LayerManager.js').LayerManager|null} */
  get #layerManager() { return this.manager?.layerManager ?? null; }

  onPointerDown(wp, e) {
    // 1. Transform handles (highest priority when selection is active)
    if (this.transform?.visible) {
      const handle = this.transform.hitTest(wp);
      if (handle) {
        this.transform.startDrag(handle, wp);
        this.#isDragging = true;
        this.#dragType = 'transform';
        this.#cursor = this.transform.getCursor(handle);
        this.manager.disableControls();
        return true;
      }
    }

    // 2. Stamp hit test
    const hitId = this.renderer?.hitTest(wp);
    if (hitId) {
      this.selection.select(hitId, e.shiftKey);
      return true;
    }

    // 3. Image overlay (resize handles, then body drag)
    const img = this.#imageOverlay;
    if (img && img.hasImage && !img.isLocked) {
      const imageVisible = this.#layerManager ? this.#layerManager.isVisible('image') : true;
      if (imageVisible) {
        const vp = this.manager.viewport;

        // Check resize handles
        const handles = img.getHandles();
        if (handles.length > 0) {
          const hits = vp.raycast(e.clientX, e.clientY, handles);
          if (hits.length > 0) {
            const idx = hits[0].object.userData.handleIndex;
            img.startResize(idx, wp);
            this.#isDragging = true;
            this.#dragType = 'image-resize';
            this.#cursor = 'nw-resize';
            this.manager.disableControls();
            return true;
          }
        }

        // Check image body
        const imgMesh = img.getImageMesh();
        if (imgMesh) {
          const hits = vp.raycast(e.clientX, e.clientY, [imgMesh]);
          if (hits.length > 0) {
            img.startDrag(wp);
            this.#isDragging = true;
            this.#dragType = 'image-drag';
            this.#cursor = 'move';
            this.manager.disableControls();
            return true;
          }
        }
      }
    }

    // 4. Empty space — start box select
    this.#boxStart = { x: e.clientX, y: e.clientY };
    this.manager.disableControls();
    return true;
  }

  onPointerMove(wp, e) {
    // Transform drag
    if (this.#isDragging && this.#dragType === 'transform') {
      const grid = this.grid;
      this.transform.updateDrag(wp, grid.visible, grid.spacing);
      return;
    }

    // Image drag
    if (this.#isDragging && this.#dragType === 'image-drag') {
      this.#imageOverlay.updateDrag(wp);
      return;
    }

    // Image resize
    if (this.#isDragging && this.#dragType === 'image-resize') {
      this.#imageOverlay.updateResize(wp);
      return;
    }

    // Box select drag
    if (this.#boxStart) {
      const dx = e.clientX - this.#boxStart.x;
      const dy = e.clientY - this.#boxStart.y;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        this.#isDragging = true;
        this.#dragType = 'box';
        this.#updateBoxSelectRect(e);
      }
      return;
    }

    // Hover cursor
    if (this.transform?.visible) {
      const handle = this.transform.hitTest(wp);
      this.#cursor = handle ? this.transform.getCursor(handle) : 'default';
    } else {
      const hitId = this.renderer?.hitTest(wp);
      this.#cursor = hitId ? 'pointer' : 'default';
    }
  }

  onPointerUp(wp, e) {
    // Transform drag end
    if (this.#isDragging && this.#dragType === 'transform') {
      this.#commitTransform();
      this.#cleanup();
      return;
    }

    // Image drag end
    if (this.#isDragging && this.#dragType === 'image-drag') {
      this.#imageOverlay.endDrag();
      this.#cleanup();
      return;
    }

    // Image resize end
    if (this.#isDragging && this.#dragType === 'image-resize') {
      this.#imageOverlay.endResize();
      this.#cleanup();
      return;
    }

    // Box select end
    if (this.#isDragging && this.#dragType === 'box') {
      this.#finishBoxSelect(wp, e);
      this.#cleanup();
      return;
    }

    // Tap on empty space — deselect
    if (this.#boxStart && !this.#isDragging) {
      if (this.selection.hasSelection) {
        this.selection.deselectAll();
      }
    }

    this.#cleanup();
  }

  #cleanup() {
    this.#boxStart = null;
    this.#isDragging = false;
    this.#dragType = null;
    this.#cursor = 'default';
    this.manager.enableControls();
  }

  getCursor() {
    return this.#cursor;
  }

  // ---- Transform commit ----

  #commitTransform() {
    const result = this.transform.endDrag();
    if (!result || !this.history) return;

    const store = this.store;
    const moves = result.moves || [];
    const rotations = result.rotations || [];
    const scales = result.scales || [];

    // Pre-applied command: already executed via live drag
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
      get description() { return `Transform stamps`; },
    };
    this.history.execute(cmd);
  }

  // ---- Box select ----

  #updateBoxSelectRect(e) {
    const rect = document.getElementById('box-select-rect');
    if (!rect || !this.#boxStart) return;

    const container = this.manager.viewport.domElement.parentElement.getBoundingClientRect();
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

  #finishBoxSelect(wp, e) {
    if (!this.#boxStart) return;

    const screenToWorld = this.manager.viewport.screenToWorld.bind(this.manager.viewport);
    const wp1 = screenToWorld(this.#boxStart.x, this.#boxStart.y);
    const wp2 = screenToWorld(e.clientX, e.clientY);
    const ids = this.renderer?.getStampsInRect(wp1.x, wp1.y, wp2.x, wp2.y) || [];

    if (ids.length > 0) {
      this.selection.selectMultiple(ids, e.shiftKey);
    }

    this.#endBoxSelect();
  }

  #endBoxSelect() {
    this.#boxStart = null;
    const rect = document.getElementById('box-select-rect');
    if (rect) rect.style.display = 'none';
  }
}

export { SelectTool };
