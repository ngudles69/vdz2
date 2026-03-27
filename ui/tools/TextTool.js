import { Tool } from './Tool.js';

/**
 * TextTool — Click to place text on the canvas.
 *
 * Click empty space → inline input appears at cursor position.
 * Type → Enter → text stamp created.
 * Escape → cancel.
 * Click existing text stamp → select it (with transform handles).
 * Double-click text stamp → edit mode (reopen inline input).
 */
class TextTool extends Tool {
  id = 'text';
  label = 'Text';

  /** @type {Function|null} PlaceStampCommand class ref */
  #PlaceStampCommand = null;

  /** @type {HTMLInputElement|null} Active inline input */
  #input = null;

  /** @type {{ x: number, y: number }|null} World position for pending text */
  #pendingPos = null;

  /** @type {string|null} ID of text stamp being edited */
  #editingId = null;

  #tappedOnStamp = false;
  #transformDragging = false;

  constructor(PlaceStampCommand) {
    super();
    this.#PlaceStampCommand = PlaceStampCommand;
  }

  onActivate() {
    this.bus?.emit('text-tool:activated');
  }

  onDeactivate() {
    this.#cancelInput();
    this.bus?.emit('text-tool:deactivated');
  }

  onPointerDown(wp, e) {
    if (this.stitchesLocked) return false;

    // If input is open, clicking outside cancels it
    if (this.#input) {
      this.#cancelInput();
      return true;
    }

    // 1. Transform handles
    if (this.transform?.visible) {
      const handle = this.transform.hitTest(wp);
      if (handle) {
        this.transform.startDrag(handle, wp);
        this.#transformDragging = true;
        this.manager.disableControls();
        return true;
      }
    }

    // 2. Hit test existing stamps
    const hitId = this.renderer?.hitTest(wp);
    if (hitId) {
      const stamp = this.store?.getById(hitId);

      // Double-click detection (within 400ms of last pointerdown)
      if (stamp?.type === 'text' && this.#tappedOnStamp && this.selection?.isSelected(hitId)) {
        this.#startEdit(hitId, e);
        return true;
      }

      this.selection.select(hitId, e.shiftKey);
      const target = this.manager?.stitchTarget;
      if (target && this.transform) this.transform.setTarget(target);
      this.#tappedOnStamp = true;
      setTimeout(() => { this.#tappedOnStamp = false; }, 400);
      return true;
    }

    // 3. Empty space — place new text
    this.#tappedOnStamp = false;
    if (this.selection?.hasSelection) {
      this.selection.deselectAll();
      return true;
    }

    this.#pendingPos = this.snapToGrid(wp);
    this.#showInput(e.clientX, e.clientY, '');
    this.manager.disableControls();
    return true;
  }

  onPointerMove(wp, e) {
    if (this.#transformDragging) {
      const grid = this.grid;
      this.transform.updateDrag(wp, grid.visible, grid.spacing);
    }
  }

  onPointerUp(wp, e) {
    if (this.#transformDragging) {
      this.#commitTransform();
      this.#transformDragging = false;
      this.manager.enableControls();
    }
  }

  getCursor() {
    if (this.transform?.visible) {
      return 'default';
    }
    return 'text';
  }

  // ---- Inline input ----

  #showInput(screenX, screenY, initialText) {
    if (this.#input) this.#cancelInput();

    const container = this.manager.viewport.container;
    const rect = container.getBoundingClientRect();

    const input = document.createElement('input');
    input.type = 'text';
    input.value = initialText;
    input.placeholder = 'Type text...';
    input.style.cssText = `
      position: absolute;
      left: ${screenX - rect.left}px;
      top: ${screenY - rect.top - 16}px;
      transform: translateX(-50%);
      z-index: 20;
      background: var(--vd-surface-2, #1e1e2a);
      color: var(--vd-text, #fff);
      border: 1px solid var(--vd-accent, #7c5cfc);
      border-radius: 4px;
      padding: 4px 8px;
      font-family: Jost, sans-serif;
      font-size: 14px;
      min-width: 120px;
      text-align: center;
      outline: none;
    `;

    input.addEventListener('keydown', (e) => {
      e.stopPropagation(); // prevent keyboard shortcuts
      if (e.key === 'Enter') {
        e.preventDefault();
        this.#confirmInput();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        this.#cancelInput();
      }
    });

    // Prevent clicks on input from propagating to canvas
    input.addEventListener('pointerdown', (e) => e.stopPropagation());

    container.appendChild(input);
    this.#input = input;

    // Focus after a tick (ensures it's in the DOM)
    requestAnimationFrame(() => input.focus());
  }

  #confirmInput() {
    if (!this.#input) return;
    const text = this.#input.value.trim();
    this.#removeInput();

    if (!text) {
      this.manager.enableControls();
      return;
    }

    // Get text style from state (set by TextToolbar)
    const style = this.state?.get('textStyle') || {};

    if (this.#editingId) {
      // Edit existing text stamp
      const oldStamp = this.store.getById(this.#editingId);
      if (oldStamp) {
        const id = this.#editingId;
        const oldText = oldStamp.text;
        const oldStyle = oldStamp.textStyle ? { ...oldStamp.textStyle } : null;
        const newStyle = { ...style };

        const cmd = {
          execute() {
            this._store.update(id, { text, textStyle: newStyle });
          },
          undo() {
            this._store.update(id, { text: oldText, textStyle: oldStyle });
          },
          _store: this.store,
          get description() { return 'Edit text'; },
        };
        this.history.execute(cmd);
      }
      this.#editingId = null;
    } else if (this.#pendingPos) {
      // Place new text stamp
      const data = {
        type: 'text',
        text,
        textStyle: { fontSize: 24, fontFamily: 'Jost, sans-serif', bold: false, italic: false, ...style },
        position: { ...this.#pendingPos },
        rotation: 0,
        colorOverride: style.color || this.state?.get('stampColor') || '#ffffff',
        opacity: 1,
      };

      this.history.execute(new this.#PlaceStampCommand(this.store, data));
      this.#pendingPos = null;

      // Switch to select tool with the new text selected (Figma behavior)
      this.manager.enableControls();
      this.manager.setActive('select');
      return;
    }

    this.manager.enableControls();
  }

  #cancelInput() {
    this.#removeInput();
    this.#pendingPos = null;
    this.#editingId = null;
    this.manager?.enableControls();
  }

  #removeInput() {
    if (this.#input && this.#input.parentNode) {
      this.#input.parentNode.removeChild(this.#input);
    }
    this.#input = null;
  }

  // ---- Edit existing text ----

  #startEdit(id, e) {
    const stamp = this.store.getById(id);
    if (!stamp || stamp.type !== 'text') return;

    this.#editingId = id;
    this.#showInput(e.clientX, e.clientY, stamp.text || '');
  }

  // ---- Transform commit (same pattern as other tools) ----

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

export { TextTool };
