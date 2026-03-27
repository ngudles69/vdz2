/**
 * AlignPanel — Popover with alignment and distribution tools.
 *
 * Shows when the align toolbar button is clicked (requires selection).
 * Operations:
 * - Align to selection: left, center, right, top, middle, bottom
 * - Distribute: horizontal, vertical spacing
 * - Center to viewport, center to origin (0,0)
 *
 * All operations are undoable via MoveStampsCommand.
 */
class AlignPanel {

  #bus;
  #store;
  #selection;
  #viewport;
  #history;
  #MoveStampsCommand;

  /** @type {HTMLElement} */
  #el;
  #visible = false;

  constructor(bus, store, selection, viewport, history, MoveStampsCommand) {
    this.#bus = bus;
    this.#store = store;
    this.#selection = selection;
    this.#viewport = viewport;
    this.#history = history;
    this.#MoveStampsCommand = MoveStampsCommand;

    this.#injectStyles();
    this.#buildDOM();

    // Close when selection changes or tool changes
    bus.on('selection:changed', () => {
      if (!this.#selection.hasSelection) this.hide();
    });

    // Close on click outside
    document.addEventListener('pointerdown', (e) => {
      if (this.#visible && !this.#el.contains(e.target) && e.target.id !== 'btn-align') {
        this.hide();
      }
    });
  }

  #injectStyles() {
    if (document.getElementById('align-panel-styles')) return;
    const style = document.createElement('style');
    style.id = 'align-panel-styles';
    style.textContent = `
      .align-panel {
        position: absolute;
        top: 48px;
        z-index: 20;
        display: none;
        flex-direction: column;
        gap: 6px;
        background: rgba(19, 19, 26, 0.97);
        border: 1px solid var(--vd-border, #2a2a38);
        border-radius: 8px;
        padding: 10px;
        font-family: Jost, sans-serif;
        font-size: 11px;
        color: var(--vd-text-dim, rgba(255,255,255,0.55));
        min-width: 160px;
      }
      .align-panel.open { display: flex; }
      .align-panel-label {
        font-size: 10px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        color: var(--vd-text-muted, rgba(255,255,255,0.3));
        margin-top: 2px;
      }
      .align-panel-row {
        display: flex;
        gap: 4px;
      }
      .align-btn {
        width: 32px;
        height: 28px;
        border: 1px solid var(--vd-border, #2a2a38);
        border-radius: 4px;
        background: var(--vd-surface-2, #1e1e2a);
        color: var(--vd-text, rgba(255,255,255,0.9));
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 18px;
        transition: all 0.1s;
        padding: 0;
      }
      .align-btn:hover {
        border-color: var(--vd-accent, #7c5cfc);
        background: rgba(124, 92, 252, 0.15);
      }
      .align-btn:active {
        background: var(--vd-accent, #7c5cfc);
      }
      .align-btn .material-symbols-rounded { font-size: 18px; }
      .align-panel-divider {
        border: none;
        border-top: 1px solid var(--vd-border, #2a2a38);
        margin: 2px 0;
      }
    `;
    document.head.appendChild(style);
  }

  #buildDOM() {
    this.#el = document.createElement('div');
    this.#el.className = 'align-panel';

    // Position near the align button
    const btn = document.getElementById('btn-align');
    if (btn) {
      const toolbar = btn.closest('.toolbar');
      if (toolbar) toolbar.style.position = 'relative';
      toolbar?.appendChild(this.#el);
    }

    // --- Align to selection ---
    this.#el.appendChild(this.#label('Align'));

    const row1 = this.#row();
    row1.appendChild(this.#btn('align_horizontal_left', 'Align left', () => this.#alignLeft()));
    row1.appendChild(this.#btn('align_horizontal_center', 'Align center', () => this.#alignCenterH()));
    row1.appendChild(this.#btn('align_horizontal_right', 'Align right', () => this.#alignRight()));
    this.#el.appendChild(row1);

    const row2 = this.#row();
    row2.appendChild(this.#btn('align_vertical_top', 'Align top', () => this.#alignTop()));
    row2.appendChild(this.#btn('align_vertical_center', 'Align middle', () => this.#alignMiddle()));
    row2.appendChild(this.#btn('align_vertical_bottom', 'Align bottom', () => this.#alignBottom()));
    this.#el.appendChild(row2);

    // --- Distribute ---
    this.#el.appendChild(this.#divider());
    this.#el.appendChild(this.#label('Distribute'));

    const row3 = this.#row();
    row3.appendChild(this.#btn('horizontal_distribute', 'Space horizontally', () => this.#distributeH()));
    row3.appendChild(this.#btn('vertical_distribute', 'Space vertically', () => this.#distributeV()));
    this.#el.appendChild(row3);

    // --- Center to ---
    this.#el.appendChild(this.#divider());
    this.#el.appendChild(this.#label('Center to'));

    const row4 = this.#row();
    row4.appendChild(this.#btn('center_focus_strong', 'Center to viewport', () => this.#centerToViewport()));
    row4.appendChild(this.#btn('my_location', 'Center to origin (0,0)', () => this.#centerToOrigin()));
    this.#el.appendChild(row4);
  }

  #label(text) {
    const el = document.createElement('div');
    el.className = 'align-panel-label';
    el.textContent = text;
    return el;
  }

  #row() {
    const el = document.createElement('div');
    el.className = 'align-panel-row';
    return el;
  }

  #btn(icon, title, action) {
    const btn = document.createElement('button');
    btn.className = 'align-btn';
    btn.title = title;
    btn.innerHTML = `<span class="material-symbols-rounded">${icon}</span>`;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      action();
    });
    return btn;
  }

  #divider() {
    const hr = document.createElement('hr');
    hr.className = 'align-panel-divider';
    return hr;
  }

  // ---- Helpers ----

  #getSelected() {
    const ids = this.#selection.selectedArray;
    return ids.map(id => this.#store.getById(id)).filter(Boolean);
  }

  #applyMoves(stamps, getNewPos) {
    const moves = stamps.map(s => ({
      id: s.id,
      from: { x: s.position.x, y: s.position.y },
      to: getNewPos(s),
    }));

    // Apply
    const store = this.#store;
    store.batchUpdate(moves.map(m => ({ id: m.id, props: { position: m.to } })));

    // Undoable command
    const cmd = {
      _first: true,
      execute() {
        if (this._first) { this._first = false; return; }
        store.batchUpdate(moves.map(m => ({ id: m.id, props: { position: m.to } })));
      },
      undo() {
        store.batchUpdate(moves.map(m => ({ id: m.id, props: { position: m.from } })));
      },
      get description() { return 'Align stamps'; },
    };
    this.#history.execute(cmd);
  }

  // ---- Align to selection ----

  #alignLeft() {
    const stamps = this.#getSelected();
    if (stamps.length < 2) return;
    const minX = Math.min(...stamps.map(s => s.position.x));
    this.#applyMoves(stamps, s => ({ x: minX, y: s.position.y }));
  }

  #alignRight() {
    const stamps = this.#getSelected();
    if (stamps.length < 2) return;
    const maxX = Math.max(...stamps.map(s => s.position.x));
    this.#applyMoves(stamps, s => ({ x: maxX, y: s.position.y }));
  }

  #alignCenterH() {
    const stamps = this.#getSelected();
    if (stamps.length < 2) return;
    const minX = Math.min(...stamps.map(s => s.position.x));
    const maxX = Math.max(...stamps.map(s => s.position.x));
    const cx = (minX + maxX) / 2;
    this.#applyMoves(stamps, s => ({ x: cx, y: s.position.y }));
  }

  #alignTop() {
    const stamps = this.#getSelected();
    if (stamps.length < 2) return;
    const maxY = Math.max(...stamps.map(s => s.position.y));
    this.#applyMoves(stamps, s => ({ x: s.position.x, y: maxY }));
  }

  #alignBottom() {
    const stamps = this.#getSelected();
    if (stamps.length < 2) return;
    const minY = Math.min(...stamps.map(s => s.position.y));
    this.#applyMoves(stamps, s => ({ x: s.position.x, y: minY }));
  }

  #alignMiddle() {
    const stamps = this.#getSelected();
    if (stamps.length < 2) return;
    const minY = Math.min(...stamps.map(s => s.position.y));
    const maxY = Math.max(...stamps.map(s => s.position.y));
    const cy = (minY + maxY) / 2;
    this.#applyMoves(stamps, s => ({ x: s.position.x, y: cy }));
  }

  // ---- Distribute ----

  #distributeH() {
    const stamps = this.#getSelected();
    if (stamps.length < 3) return;
    const sorted = [...stamps].sort((a, b) => a.position.x - b.position.x);
    const minX = sorted[0].position.x;
    const maxX = sorted[sorted.length - 1].position.x;
    const step = (maxX - minX) / (sorted.length - 1);
    this.#applyMoves(stamps, s => {
      const idx = sorted.indexOf(s);
      return { x: minX + idx * step, y: s.position.y };
    });
  }

  #distributeV() {
    const stamps = this.#getSelected();
    if (stamps.length < 3) return;
    const sorted = [...stamps].sort((a, b) => a.position.y - b.position.y);
    const minY = sorted[0].position.y;
    const maxY = sorted[sorted.length - 1].position.y;
    const step = (maxY - minY) / (sorted.length - 1);
    this.#applyMoves(stamps, s => {
      const idx = sorted.indexOf(s);
      return { x: s.position.x, y: minY + idx * step };
    });
  }

  // ---- Center to ----

  #centerToViewport() {
    const stamps = this.#getSelected();
    if (stamps.length === 0) return;
    const cam = this.#viewport.camera;
    const targetX = cam.position.x;
    const targetY = cam.position.y;
    this.#centerTo(stamps, targetX, targetY);
  }

  #centerToOrigin() {
    const stamps = this.#getSelected();
    if (stamps.length === 0) return;
    this.#centerTo(stamps, 0, 0);
  }

  #centerTo(stamps, targetX, targetY) {
    let cx = 0, cy = 0;
    for (const s of stamps) { cx += s.position.x; cy += s.position.y; }
    cx /= stamps.length;
    cy /= stamps.length;
    const dx = targetX - cx;
    const dy = targetY - cy;
    this.#applyMoves(stamps, s => ({ x: s.position.x + dx, y: s.position.y + dy }));
  }

  // ---- Show / hide ----

  toggle() {
    if (this.#visible) this.hide();
    else this.show();
  }

  show() {
    if (!this.#selection.hasSelection) return;
    // Position below the align button
    const btn = document.getElementById('btn-align');
    if (btn) {
      const rect = btn.getBoundingClientRect();
      const toolbar = btn.closest('.toolbar');
      const toolbarRect = toolbar?.getBoundingClientRect();
      if (toolbarRect) {
        this.#el.style.left = `${rect.left - toolbarRect.left}px`;
      }
    }
    this.#visible = true;
    this.#el.classList.add('open');
  }

  hide() {
    this.#visible = false;
    this.#el.classList.remove('open');
  }

  get isVisible() { return this.#visible; }
}

export { AlignPanel };
