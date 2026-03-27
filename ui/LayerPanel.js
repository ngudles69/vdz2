/**
 * LayerPanel — Builds and wires the layer panel UI.
 *
 * Each layer row: [Name]  ...  [layer-specific] [lock] [eye] [gear]
 * Gear opens a centered config modal with per-layer settings.
 */
class LayerPanel {

  #bus;
  #layerManager;
  #viewport;
  #imageOverlay;
  #history;

  /** @type {HTMLElement} */
  #listEl;

  /** @type {HTMLElement} */
  #overlay;

  /** @type {HTMLElement} */
  #modalTitle;

  /** @type {HTMLElement} */
  #modalBody;

  /**
   * @param {object} bus
   * @param {object} layerManager
   * @param {object} viewport
   * @param {object} imageOverlay
   * @param {object} history
   */
  constructor(bus, layerManager, viewport, imageOverlay, history) {
    this.#bus = bus;
    this.#layerManager = layerManager;
    this.#viewport = viewport;
    this.#imageOverlay = imageOverlay;
    this.#history = history;

    this.#listEl = document.getElementById('layer-list');
    this.#overlay = document.getElementById('layer-config-overlay');
    this.#modalTitle = document.getElementById('layer-config-title');
    this.#modalBody = document.getElementById('layer-config-body');

    this.#buildRows();
    this.#wireModal();
    this.#wireEvents();
  }

  // ---- Build layer rows ----

  #buildRows() {
    this.#listEl.innerHTML = '';
    const layers = this.#layerManager.getLayers(); // sorted z desc (top to bottom)

    for (const layer of layers) {
      const row = document.createElement('div');
      row.className = 'layer-row';
      row.dataset.layer = layer.name;

      // Name
      const name = document.createElement('span');
      name.className = 'layer-name';
      name.textContent = layer.label;
      row.appendChild(name);

      // Actions
      const actions = document.createElement('div');
      actions.className = 'layer-actions';

      // Layer-specific icons
      if (layer.name === 'image') {
        const uploadBtn = this.#makeBtn('add_photo_alternate', 'Upload image');
        uploadBtn.classList.add('layer-upload');
        uploadBtn.addEventListener('click', () => {
          document.getElementById('image-upload').click();
        });
        actions.appendChild(uploadBtn);
      }

      // Lock
      const lockBtn = this.#makeBtn(layer.locked ? 'lock' : 'lock_open', 'Lock');
      lockBtn.classList.add('layer-lock');
      lockBtn.addEventListener('click', () => {
        const isLocked = this.#layerManager.isLocked(layer.name);
        this.#layerManager.setLocked(layer.name, !isLocked);
      });
      actions.appendChild(lockBtn);

      // Visibility
      const visBtn = this.#makeBtn(layer.visible ? 'visibility' : 'visibility_off', 'Visibility');
      visBtn.classList.add('layer-vis');
      if (!layer.visible) visBtn.classList.add('off');
      visBtn.addEventListener('click', () => {
        const isVisible = this.#layerManager.isVisible(layer.name);
        this.#layerManager.setVisible(layer.name, !isVisible);
      });
      actions.appendChild(visBtn);

      // Config gear
      const gearBtn = this.#makeBtn('settings', 'Settings');
      gearBtn.classList.add('layer-config');
      gearBtn.addEventListener('click', () => {
        this.#openConfig(layer.name);
      });
      actions.appendChild(gearBtn);

      row.appendChild(actions);
      this.#listEl.appendChild(row);
    }
  }

  #makeBtn(icon, title) {
    const btn = document.createElement('button');
    btn.className = 'layer-btn';
    btn.title = title;
    btn.innerHTML = `<span class="material-symbols-rounded">${icon}</span>`;
    return btn;
  }

  // ---- Config modal ----

  #wireModal() {
    // Close button
    document.getElementById('layer-config-close').addEventListener('click', () => {
      this.#closeConfig();
    });

    // Click backdrop to close
    this.#overlay.addEventListener('click', (e) => {
      if (e.target === this.#overlay) this.#closeConfig();
    });

    // Wire image upload file input
    document.getElementById('image-upload').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file && this.#imageOverlay) {
        this.#imageOverlay.loadImage(file);
      }
      e.target.value = '';
    });
  }

  #openConfig(layerName) {
    const layers = this.#layerManager.getLayers();
    const layer = layers.find(l => l.name === layerName);
    if (!layer) return;

    this.#modalTitle.textContent = `${layer.label} Settings`;
    this.#modalBody.innerHTML = '';

    switch (layerName) {
      case 'background':
        this.#buildBackgroundConfig();
        break;
      case 'image':
        this.#buildImageConfig();
        break;
      case 'stitches':
        this.#buildStitchesConfig();
        break;
    }

    this.#overlay.classList.add('open');
  }

  #closeConfig() {
    this.#overlay.classList.remove('open');
  }

  #buildBackgroundConfig() {
    // Color picker
    const row = this.#makeSettingsRow('Color');
    const input = document.createElement('input');
    input.type = 'color';
    input.value = '#0d0d0f';
    input.addEventListener('input', (e) => {
      this.#viewport.setBackground('solid', { color: e.target.value });
    });
    row.appendChild(input);
    this.#modalBody.appendChild(row);
  }

  #buildImageConfig() {
    // Upload
    const uploadRow = document.createElement('div');
    uploadRow.className = 'layer-config-actions';

    const uploadBtn = document.createElement('button');
    uploadBtn.className = 'layer-config-btn';
    uploadBtn.innerHTML = '<span class="material-symbols-rounded">add_photo_alternate</span> Upload';
    uploadBtn.addEventListener('click', () => {
      document.getElementById('image-upload').click();
    });
    uploadRow.appendChild(uploadBtn);

    const clearBtn = document.createElement('button');
    clearBtn.className = 'layer-btn';
    clearBtn.title = 'Remove image';
    clearBtn.innerHTML = '<span class="material-symbols-rounded">delete</span>';
    clearBtn.addEventListener('click', () => {
      this.#imageOverlay.removeImage();
    });
    uploadRow.appendChild(clearBtn);

    this.#modalBody.appendChild(uploadRow);

    // Opacity
    const opacityRow = this.#makeSettingsRow('Opacity %');
    const opacityInput = document.createElement('input');
    opacityInput.type = 'number';
    opacityInput.min = '0';
    opacityInput.max = '100';
    opacityInput.step = '5';
    opacityInput.value = Math.round(this.#layerManager.getOpacity('image') * 100);
    opacityInput.addEventListener('change', (e) => {
      this.#layerManager.setOpacity('image', parseInt(e.target.value) / 100);
    });
    opacityRow.appendChild(opacityInput);
    this.#modalBody.appendChild(opacityRow);

    // Fit mode
    const fitRow = this.#makeSettingsRow('Fit mode');
    const fitSelect = document.createElement('select');
    fitSelect.innerHTML = `
      <option value="centered">Centered</option>
      <option value="canvasView">Fit to View</option>
    `;
    fitSelect.value = this.#imageOverlay.fitMode;
    fitSelect.addEventListener('change', (e) => {
      this.#imageOverlay.setFitMode(e.target.value);
    });
    fitRow.appendChild(fitSelect);
    this.#modalBody.appendChild(fitRow);

    // Blend mode
    const blendRow = this.#makeSettingsRow('Blend mode');
    const blendSelect = document.createElement('select');
    blendSelect.innerHTML = `
      <option value="normal">Normal</option>
      <option value="multiply">Multiply</option>
      <option value="screen">Screen</option>
    `;
    blendSelect.value = this.#imageOverlay.blendMode;
    blendSelect.addEventListener('change', (e) => {
      this.#imageOverlay.setBlendMode(e.target.value);
    });
    blendRow.appendChild(blendSelect);
    this.#modalBody.appendChild(blendRow);
  }

  #buildStitchesConfig() {
    // Opacity
    const opacityRow = this.#makeSettingsRow('Opacity %');
    const opacityInput = document.createElement('input');
    opacityInput.type = 'number';
    opacityInput.min = '0';
    opacityInput.max = '100';
    opacityInput.step = '5';
    opacityInput.value = Math.round(this.#layerManager.getOpacity('stitches') * 100);
    opacityInput.addEventListener('change', (e) => {
      this.#layerManager.setOpacity('stitches', parseInt(e.target.value) / 100);
    });
    opacityRow.appendChild(opacityInput);
    this.#modalBody.appendChild(opacityRow);
  }

  #makeSettingsRow(label) {
    const row = document.createElement('div');
    row.className = 'settings-row';
    const lbl = document.createElement('label');
    lbl.textContent = label;
    row.appendChild(lbl);
    return row;
  }

  // ---- Event sync ----

  #wireEvents() {
    this.#bus.on('layer:visibility-changed', ({ name, visible }) => {
      const row = this.#listEl.querySelector(`[data-layer="${name}"]`);
      if (!row) return;
      const btn = row.querySelector('.layer-vis');
      if (!btn) return;
      btn.querySelector('.material-symbols-rounded').textContent = visible ? 'visibility' : 'visibility_off';
      btn.classList.toggle('off', !visible);
    });

    this.#bus.on('layer:lock-changed', ({ name, locked }) => {
      const row = this.#listEl.querySelector(`[data-layer="${name}"]`);
      if (!row) return;
      const btn = row.querySelector('.layer-lock');
      if (!btn) return;
      btn.querySelector('.material-symbols-rounded').textContent = locked ? 'lock' : 'lock_open';

      // Sync image overlay lock if it's the image layer
      if (name === 'image' && this.#imageOverlay) {
        this.#imageOverlay.setLocked(locked);
      }
    });

    this.#bus.on('image:loaded', () => {
      // Could update UI indicators if needed
    });

    this.#bus.on('image:removed', () => {
      // Could update UI indicators if needed
    });
  }
}

export { LayerPanel };
