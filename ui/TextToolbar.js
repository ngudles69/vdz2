/**
 * TextToolbar — Floating toolbar for text stamp configuration.
 *
 * Shows when text tool is active or a text stamp is selected.
 * Controls: font size, bold, italic, color.
 * Writes to State key 'textStyle' so TextTool picks up defaults.
 * When a text stamp is selected, reflects and edits its properties.
 */
class TextToolbar {

  /** @type {import('../core/EventBus.js').EventBus} */
  #bus;

  /** @type {import('../core/State.js').State} */
  #state;

  /** @type {import('./SelectionManager.js').SelectionManager} */
  #selection;

  /** @type {import('../modules/StitchStore.js').StitchStore} */
  #store;

  /** @type {import('../core/HistoryManager.js').HistoryManager} */
  #history;

  /** @type {HTMLElement} */
  #el;

  /** @type {boolean} */
  #visible = false;

  // Controls
  #sizeInput;
  #boldBtn;
  #italicBtn;
  #colorInput;

  constructor(bus, state, selection, store, history) {
    this.#bus = bus;
    this.#state = state;
    this.#selection = selection;
    this.#store = store;
    this.#history = history;

    this.#injectStyles();
    this.#buildDOM();

    // Initialize default text style in state
    if (!state.get('textStyle')) {
      state.set('textStyle', { fontSize: 24, bold: false, italic: false, fontFamily: 'Jost, sans-serif' });
    }

    // Show/hide based on tool and selection
    bus.on('text-tool:activated', () => this.show());
    bus.on('text-tool:deactivated', () => {
      if (!this.#hasTextSelected()) this.hide();
    });
    bus.on('tool:changed', ({ id }) => {
      if (id !== 'text' && !this.#hasTextSelected()) this.hide();
    });
    bus.on('selection:changed', () => {
      if (this.#hasTextSelected()) {
        this.show();
        this.#reflectSelection();
      } else if (this.#state.get('activeTool') !== 'text') {
        this.hide();
      }
    });
  }

  #hasTextSelected() {
    if (!this.#selection.hasSelection) return false;
    const ids = this.#selection.selectedArray;
    return ids.some(id => {
      const s = this.#store.getById(id);
      return s?.type === 'text';
    });
  }

  #injectStyles() {
    if (document.getElementById('text-toolbar-styles')) return;
    const style = document.createElement('style');
    style.id = 'text-toolbar-styles';
    style.textContent = `
      .text-toolbar {
        position: absolute;
        top: 8px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 15;
        display: none;
        align-items: center;
        gap: 8px;
        background: rgba(19, 19, 26, 0.95);
        border: 1px solid var(--vd-border, #2a2a38);
        border-radius: 6px;
        padding: 4px 12px;
        font-family: Jost, sans-serif;
        font-size: 13px;
        color: var(--vd-text, rgba(255,255,255,0.9));
      }
      .text-toolbar.open { display: flex; }
      .text-toolbar label { font-size: 11px; color: var(--vd-text-dim); white-space: nowrap; }
      .text-toolbar input[type="number"] {
        width: 48px;
        background: var(--vd-surface-2, #1e1e2a);
        border: 1px solid var(--vd-border, #2a2a38);
        border-radius: 3px;
        color: var(--vd-text);
        padding: 2px 4px;
        font-size: 13px;
        font-family: inherit;
      }
      .text-toolbar input[type="color"] {
        width: 28px;
        height: 24px;
        border: 1px solid var(--vd-border);
        border-radius: 3px;
        background: none;
        padding: 0;
        cursor: pointer;
      }
      .text-toolbar .tt-toggle {
        width: 28px;
        height: 28px;
        border: 1px solid var(--vd-border);
        border-radius: 3px;
        background: var(--vd-surface-2);
        color: var(--vd-text-dim);
        font-size: 14px;
        font-family: inherit;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.1s;
      }
      .text-toolbar .tt-toggle.active {
        background: var(--vd-accent, #7c5cfc);
        color: #fff;
        border-color: var(--vd-accent);
      }
      .text-toolbar .tt-toggle:hover { border-color: var(--vd-accent); }
    `;
    document.head.appendChild(style);
  }

  #buildDOM() {
    const container = document.getElementById('canvas-container');
    if (!container) return;

    this.#el = document.createElement('div');
    this.#el.className = 'text-toolbar';

    // Font size
    const sizeLabel = document.createElement('label');
    sizeLabel.textContent = 'Size';
    this.#sizeInput = document.createElement('input');
    this.#sizeInput.type = 'number';
    this.#sizeInput.min = '8';
    this.#sizeInput.max = '200';
    this.#sizeInput.step = '2';
    this.#sizeInput.value = '24';
    this.#sizeInput.addEventListener('change', () => this.#onStyleChange());

    // Bold
    this.#boldBtn = document.createElement('button');
    this.#boldBtn.className = 'tt-toggle';
    this.#boldBtn.innerHTML = '<b>B</b>';
    this.#boldBtn.title = 'Bold';
    this.#boldBtn.addEventListener('click', () => {
      this.#boldBtn.classList.toggle('active');
      this.#onStyleChange();
    });

    // Italic
    this.#italicBtn = document.createElement('button');
    this.#italicBtn.className = 'tt-toggle';
    this.#italicBtn.innerHTML = '<i>I</i>';
    this.#italicBtn.title = 'Italic';
    this.#italicBtn.addEventListener('click', () => {
      this.#italicBtn.classList.toggle('active');
      this.#onStyleChange();
    });

    // Color
    const colorLabel = document.createElement('label');
    colorLabel.textContent = 'Color';
    this.#colorInput = document.createElement('input');
    this.#colorInput.type = 'color';
    this.#colorInput.value = '#ffffff';
    this.#colorInput.addEventListener('input', () => this.#onStyleChange());

    this.#el.appendChild(sizeLabel);
    this.#el.appendChild(this.#sizeInput);
    this.#el.appendChild(this.#boldBtn);
    this.#el.appendChild(this.#italicBtn);
    this.#el.appendChild(colorLabel);
    this.#el.appendChild(this.#colorInput);

    container.appendChild(this.#el);
  }

  #onStyleChange() {
    const style = {
      fontSize: parseInt(this.#sizeInput.value) || 24,
      bold: this.#boldBtn.classList.contains('active'),
      italic: this.#italicBtn.classList.contains('active'),
      fontFamily: 'Jost, sans-serif',
      color: this.#colorInput.value,
    };

    // Save as default for new text stamps
    this.#state.set('textStyle', style);

    // If text stamps are selected, update them
    if (this.#hasTextSelected()) {
      const ids = this.#selection.selectedArray.filter(id => {
        const s = this.#store.getById(id);
        return s?.type === 'text';
      });

      if (ids.length > 0) {
        const updates = ids.map(id => ({
          id,
          props: {
            textStyle: { ...style },
            colorOverride: style.color,
          },
        }));

        // Create undo command
        const oldStates = ids.map(id => {
          const s = this.#store.getById(id);
          return { id, textStyle: s.textStyle ? { ...s.textStyle } : null, colorOverride: s.colorOverride };
        });

        const store = this.#store;
        const cmd = {
          _first: true,
          execute() {
            if (this._first) { this._first = false; return; }
            store.batchUpdate(updates);
          },
          undo() {
            store.batchUpdate(oldStates.map(o => ({
              id: o.id,
              props: { textStyle: o.textStyle, colorOverride: o.colorOverride },
            })));
          },
          get description() { return 'Change text style'; },
        };

        // Apply immediately
        this.#store.batchUpdate(updates);
        this.#history.execute(cmd);
      }
    }
  }

  /** Reflect selected text stamp properties in the toolbar */
  #reflectSelection() {
    const ids = this.#selection.selectedArray;
    const textStamp = ids.map(id => this.#store.getById(id)).find(s => s?.type === 'text');
    if (!textStamp) return;

    const style = textStamp.textStyle || {};
    this.#sizeInput.value = style.fontSize || 24;
    this.#boldBtn.classList.toggle('active', !!style.bold);
    this.#italicBtn.classList.toggle('active', !!style.italic);
    this.#colorInput.value = textStamp.colorOverride || style.color || '#ffffff';
  }

  show() {
    this.#visible = true;
    this.#el.classList.add('open');
  }

  hide() {
    this.#visible = false;
    this.#el.classList.remove('open');
  }

  get isVisible() { return this.#visible; }
}

export { TextToolbar };
