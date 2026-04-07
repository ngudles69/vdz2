/**
 * ExportPanel — Export dialog for clip generation.
 *
 * Shows format selection, resolution, FPS, progress bar,
 * and download link. Triggered from the toolbar.
 */
import { ClipRenderer } from '../modules/ClipRenderer.js';
import { RecipeInterpreter } from '../modules/RecipeInterpreter.js';
import { ClipEncoder } from '../modules/ClipEncoder.js';

class ExportPanel {

  /** @type {import('../core/EventBus.js').EventBus} */
  #bus;

  /** @type {import('../modules/ClipRecipe.js').ClipRecipe} */
  #recipe;

  /** @type {import('../modules/StitchStore.js').StitchStore} */
  #store;

  /** @type {import('../modules/StitchAtlas.js').StitchAtlas} */
  #atlas;

  /** @type {import('../modules/SetManager.js').SetManager} */
  #setManager;

  /** @type {import('./VideoZone.js').VideoZone} */
  #videoZone;

  /** @type {import('./Viewport.js').Viewport} */
  #viewport;

  /** @type {HTMLElement} */
  #overlay;

  /** @type {HTMLElement} */
  #dialog;

  /** @type {ClipEncoder|null} */
  #encoder = null;

  /** @type {boolean} */
  #generating = false;

  constructor(bus, recipe, store, atlas, setManager, videoZone, viewport) {
    this.#bus = bus;
    this.#recipe = recipe;
    this.#store = store;
    this.#atlas = atlas;
    this.#setManager = setManager;
    this.#videoZone = videoZone;
    this.#viewport = viewport;

    this.#buildDialog();
    this.#injectStyles();
  }

  show() {
    this.#overlay.style.display = 'flex';
    this.#populateResolutions();
    this.#resetUI();
  }

  /**
   * Rebuild the resolution dropdown from the current document size.
   * The 100% option exports at the document's native pixel dimensions;
   * the other options downscale while preserving the document aspect ratio.
   */
  #populateResolutions() {
    const select = this.#dialog.querySelector('#export-resolution');
    const docW = this.#viewport.docWidth;
    const docH = this.#viewport.docHeight;

    // Round to even numbers — video encoders reject odd dimensions
    const even = (n) => Math.max(2, Math.floor(n / 2) * 2);

    const factors = [
      { label: '100%', scale: 1.0 },
      { label: '75%',  scale: 0.75 },
      { label: '50%',  scale: 0.5 },
      { label: '25%',  scale: 0.25 },
    ];

    select.innerHTML = '';
    for (const { label, scale } of factors) {
      const w = even(docW * scale);
      const h = even(docH * scale);
      const opt = document.createElement('option');
      opt.value = `${w}x${h}`;
      opt.textContent = `${w} × ${h} (${label})`;
      if (scale === 1.0) opt.selected = true;
      select.appendChild(opt);
    }
  }

  hide() {
    if (this.#generating) return; // don't close while generating
    this.#overlay.style.display = 'none';
  }

  toggle() {
    if (this.#overlay.style.display === 'flex') this.hide();
    else this.show();
  }

  // ================================================================
  // Build dialog
  // ================================================================

  #buildDialog() {
    this.#overlay = document.createElement('div');
    this.#overlay.className = 'export-overlay';
    this.#overlay.style.display = 'none';

    this.#dialog = document.createElement('div');
    this.#dialog.className = 'export-dialog';
    this.#dialog.innerHTML = `
      <button class="export-close" id="export-close">
        <span class="material-symbols-rounded" style="font-size:18px;">close</span>
      </button>
      <h3 class="export-title">Export Clip</h3>

      <div class="export-row">
        <label>Format</label>
        <select id="export-format">
          <option value="greenscreen" selected>MP4 Green Screen (chroma key)</option>
          <option value="webm">WebM (transparent)</option>
          <option value="png">PNG Sequence</option>
          <option value="mov" disabled>MOV (requires app)</option>
        </select>
      </div>

      <div class="export-row">
        <label>Resolution</label>
        <select id="export-resolution">
          <!-- Populated in #populateResolutions() from the current document size -->
        </select>
      </div>

      <div class="export-row">
        <label>FPS</label>
        <select id="export-fps">
          <option value="24">24</option>
          <option value="30" selected>30</option>
          <option value="60">60</option>
        </select>
      </div>

      <div class="export-info" id="export-info"></div>

      <div class="export-progress-wrap" id="export-progress-wrap" style="display:none;">
        <div class="export-progress-bar">
          <div class="export-progress-fill" id="export-progress-fill"></div>
        </div>
        <div class="export-progress-text" id="export-progress-text"></div>
      </div>

      <div class="export-result" id="export-result" style="display:none;">
        <a id="export-download" class="export-download-btn">Download</a>
      </div>

      <div class="export-actions">
        <button class="export-cancel-btn" id="export-cancel" style="display:none;">Cancel</button>
        <button class="export-generate-btn" id="export-generate">Generate</button>
      </div>
    `;

    this.#overlay.appendChild(this.#dialog);
    document.body.appendChild(this.#overlay);

    // Close
    this.#dialog.querySelector('#export-close').addEventListener('click', () => this.hide());
    this.#overlay.addEventListener('click', (e) => {
      if (e.target === this.#overlay) this.hide();
    });

    // Generate
    this.#dialog.querySelector('#export-generate').addEventListener('click', () => this.#startGenerate());

    // Cancel
    this.#dialog.querySelector('#export-cancel').addEventListener('click', () => this.#cancelGenerate());

    // Update info on setting change
    this.#dialog.querySelector('#export-format').addEventListener('change', () => this.#updateInfo());
    this.#dialog.querySelector('#export-resolution').addEventListener('change', () => this.#updateInfo());
    this.#dialog.querySelector('#export-fps').addEventListener('change', () => this.#updateInfo());
  }

  #resetUI() {
    this.#dialog.querySelector('#export-progress-wrap').style.display = 'none';
    this.#dialog.querySelector('#export-result').style.display = 'none';
    this.#dialog.querySelector('#export-cancel').style.display = 'none';
    this.#dialog.querySelector('#export-generate').style.display = '';
    this.#dialog.querySelector('#export-generate').disabled = false;
    this.#updateInfo();
  }

  async #updateInfo() {
    const info = this.#dialog.querySelector('#export-info');
    const format = this.#dialog.querySelector('#export-format').value;
    const sections = this.#videoZone.sections;
    const fps = parseInt(this.#dialog.querySelector('#export-fps').value);
    const [w, h] = this.#dialog.querySelector('#export-resolution').value.split('x').map(Number);

    const lines = [];
    const missing = [];

    if (this.#videoZone.duration <= 0) missing.push('No video duration (load a video or a saved project)');
    if (this.#videoZone.bookmarks.length === 0) missing.push('No bookmarks defined');
    if (sections.length === 0) missing.push('No sections (add bookmarks to create sections)');

    if (missing.length > 0) {
      info.innerHTML = missing.map(m => `<span style="color:var(--vd-warning)">${m}</span>`).join('<br>');
      this.#dialog.querySelector('#export-generate').disabled = true;
      return;
    }

    const interpreter = new RecipeInterpreter(this.#recipe, sections, fps);
    const totalFrames = interpreter.getTotalFrames();
    const duration = interpreter.getDuration();

    if (totalFrames === 0) {
      info.innerHTML = 'No effects assigned in the clip grid.';
      this.#dialog.querySelector('#export-generate').disabled = true;
      return;
    }

    lines.push(`${totalFrames} frames, ${duration.toFixed(1)}s duration`);

    // Check codec support for video formats
    if (format !== 'png') {
      if (!ClipEncoder.isWebCodecsSupported()) {
        lines.push('<span style="color:var(--vd-warning)">⚠ WebCodecs not available. Only PNG export is supported on this browser.</span>');
        this.#dialog.querySelector('#export-generate').disabled = true;
      } else {
        // Check VP9 alpha support
        if (format === 'webm') {
          const alphaConfig = { codec: 'vp09.00.10.08', width: w, height: h, bitrate: 4_000_000, framerate: fps, alpha: 'keep' };
          const support = await VideoEncoder.isConfigSupported(alphaConfig);
          if (support.supported) {
            lines.push('VP9 + alpha supported ✓');
          } else {
            lines.push('<span style="color:var(--vd-warning)">⚠ VP9 alpha not supported. Output will be VP8 without transparency.</span>');
          }
        }
        if (format === 'greenscreen') {
          const gsConfig = { codec: 'avc1.640028', width: w, height: h, bitrate: 4_000_000, framerate: fps };
          const support = await VideoEncoder.isConfigSupported(gsConfig);
          if (support.supported) {
            lines.push('H.264 supported ✓ — output: MP4');
          } else {
            lines.push('<span style="color:var(--vd-error)">H.264 not supported on this browser.</span>');
            this.#dialog.querySelector('#export-generate').disabled = true;
          }
        }
      }
    }

    info.innerHTML = lines.join('<br>');
    if (!this.#dialog.querySelector('#export-generate').disabled) {
      this.#dialog.querySelector('#export-generate').disabled = false;
    }
  }

  // ================================================================
  // Generation
  // ================================================================

  async #startGenerate() {
    const format = this.#dialog.querySelector('#export-format').value;
    const [w, h] = this.#dialog.querySelector('#export-resolution').value.split('x').map(Number);
    const fps = parseInt(this.#dialog.querySelector('#export-fps').value);

    if (!ClipEncoder.isWebCodecsSupported() && format !== 'png') {
      this.#dialog.querySelector('#export-info').innerHTML =
        '<span style="color:var(--vd-error)">WebCodecs not available on this browser. Please select PNG Sequence instead.</span>';
      return;
    }

    const sections = this.#videoZone.hasVideo ? this.#videoZone.sections : [];

    // Set up renderer. Output resolution is w × h, but the camera is
    // framed to the document size so the whole document is captured.
    const clipRenderer = new ClipRenderer();
    clipRenderer.setup(this.#store, this.#atlas, this.#setManager, {
      width: w,
      height: h,
      docWidth: this.#viewport.docWidth,
      docHeight: this.#viewport.docHeight,
    });

    // Set up interpreter
    const interpreter = new RecipeInterpreter(this.#recipe, sections, fps);

    // Set up encoder
    this.#encoder = new ClipEncoder(clipRenderer, interpreter, { format });

    // UI state
    this.#generating = true;
    this.#dialog.querySelector('#export-generate').style.display = 'none';
    this.#dialog.querySelector('#export-cancel').style.display = '';
    this.#dialog.querySelector('#export-progress-wrap').style.display = '';
    this.#dialog.querySelector('#export-result').style.display = 'none';

    try {
      const result = await this.#encoder.generate((progress) => {
        const fill = this.#dialog.querySelector('#export-progress-fill');
        const text = this.#dialog.querySelector('#export-progress-text');
        fill.style.width = `${progress.percent}%`;
        text.textContent = `Rendering frame ${progress.currentFrame} / ${progress.totalFrames}`;
      });

      // Show download
      this.#generating = false;
      this.#dialog.querySelector('#export-cancel').style.display = 'none';

      if (format === 'png') {
        this.#showPNGDownload(result);
      } else {
        this.#showBlobDownload(result.blob, result.filename);
      }

      this.#dialog.querySelector('#export-progress-text').textContent = 'Done!';

    } catch (err) {
      this.#generating = false;
      this.#dialog.querySelector('#export-cancel').style.display = 'none';
      this.#dialog.querySelector('#export-generate').style.display = '';

      if (err.message !== 'Generation cancelled') {
        console.error('Clip generation failed:', err);
        this.#dialog.querySelector('#export-progress-text').textContent = `Error: ${err.message}`;
      } else {
        this.#dialog.querySelector('#export-progress-text').textContent = 'Cancelled.';
      }
    } finally {
      clipRenderer.dispose();
      this.#encoder = null;
    }
  }

  #cancelGenerate() {
    if (this.#encoder) {
      this.#encoder.cancel();
    }
  }

  #showBlobDownload(blob, filename) {
    const resultDiv = this.#dialog.querySelector('#export-result');
    resultDiv.innerHTML = '';

    const sizeMB = (blob.size / 1024 / 1024).toFixed(1);
    const ext = filename.split('.').pop() || '';

    const btn = document.createElement('button');
    btn.className = 'export-download-btn';
    btn.textContent = `Save As… (${sizeMB} MB)`;
    btn.addEventListener('click', async () => {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: filename,
          types: [{
            description: `${ext.toUpperCase()} file`,
            accept: { [blob.type || 'application/octet-stream']: [`.${ext}`] },
          }],
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        btn.textContent = `Saved as ${handle.name}`;
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.error('Save failed:', err);
          btn.textContent = `Save failed: ${err.message}`;
        }
      }
    });
    resultDiv.appendChild(btn);
    resultDiv.style.display = '';
  }

  #showPNGDownload(result) {
    const resultDiv = this.#dialog.querySelector('#export-result');
    resultDiv.innerHTML = '';

    const btn = document.createElement('button');
    btn.className = 'export-download-btn';
    btn.textContent = `Save to folder… (${result.blobs.length + 1} files)`;
    btn.addEventListener('click', async () => {
      try {
        const dir = await window.showDirectoryPicker({ mode: 'readwrite' });

        // meta.json
        const metaHandle = await dir.getFileHandle('meta.json', { create: true });
        const metaWritable = await metaHandle.createWritable();
        await metaWritable.write(result.metaBlob);
        await metaWritable.close();

        // frames
        for (let i = 0; i < result.blobs.length; i++) {
          const name = `${String(i + 1).padStart(4, '0')}.png`;
          const fh = await dir.getFileHandle(name, { create: true });
          const w = await fh.createWritable();
          await w.write(result.blobs[i]);
          await w.close();
          btn.textContent = `Saving… ${i + 1} / ${result.blobs.length}`;
        }
        btn.textContent = `Saved ${result.blobs.length + 1} files to ${dir.name}`;
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.error('Save to folder failed:', err);
          btn.textContent = `Save failed: ${err.message}`;
        }
      }
    });
    resultDiv.appendChild(btn);
    resultDiv.style.display = '';
  }

  // ================================================================
  // Styles
  // ================================================================

  #injectStyles() {
    if (document.getElementById('export-panel-styles')) return;
    const style = document.createElement('style');
    style.id = 'export-panel-styles';
    style.textContent = `
      .export-overlay {
        display: none;
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.5);
        z-index: 400;
        align-items: center;
        justify-content: center;
      }

      .export-dialog {
        background: var(--vd-surface, #13131a);
        border: 1px solid var(--vd-border, #2a2a38);
        border-radius: 8px;
        padding: 24px 28px 28px;
        min-width: 340px;
        max-width: 420px;
        position: relative;
      }

      .export-close {
        position: absolute;
        top: 8px;
        right: 8px;
        background: none;
        border: none;
        color: var(--vd-text-muted);
        cursor: pointer;
        width: 28px;
        height: 28px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 4px;
      }

      .export-close:hover {
        color: var(--vd-text);
      }

      .export-title {
        font-size: 18px;
        font-weight: 400;
        letter-spacing: 0.06em;
        color: var(--vd-text);
        margin-bottom: 20px;
      }

      .export-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 14px;
      }

      .export-row label {
        font-size: 14px;
        color: var(--vd-text-dim);
        margin-right: 16px;
      }

      .export-row select {
        background: var(--vd-surface-2, #1e1e2a);
        color: var(--vd-text);
        border: 1px solid var(--vd-border, #2a2a38);
        border-radius: 4px;
        height: 30px;
        font-family: inherit;
        font-size: 13px;
        padding: 0 8px;
        outline: none;
        min-width: 180px;
      }

      .export-row select:focus {
        border-color: var(--vd-accent, #7c5cfc);
      }

      .export-row select option:disabled {
        color: var(--vd-text-muted);
      }

      .export-info {
        font-size: 12px;
        color: var(--vd-text-muted);
        margin-bottom: 16px;
        min-height: 18px;
      }

      .export-progress-wrap {
        margin-bottom: 16px;
      }

      .export-progress-bar {
        height: 8px;
        background: var(--vd-surface-2, #1e1e2a);
        border-radius: 4px;
        overflow: hidden;
        margin-bottom: 6px;
      }

      .export-progress-fill {
        height: 100%;
        background: var(--vd-accent, #7c5cfc);
        border-radius: 4px;
        width: 0%;
        transition: width 0.15s;
      }

      .export-progress-text {
        font-size: 12px;
        color: var(--vd-text-dim);
      }

      .export-result {
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin-bottom: 16px;
      }

      .export-download-btn {
        display: inline-block;
        padding: 8px 16px;
        background: var(--vd-accent, #7c5cfc);
        color: #fff;
        border: none;
        border-radius: 4px;
        font-family: inherit;
        font-size: 14px;
        cursor: pointer;
        text-align: center;
        text-decoration: none;
      }

      .export-download-btn:hover {
        opacity: 0.9;
      }

      .export-actions {
        display: flex;
        justify-content: flex-end;
        gap: 10px;
      }

      .export-generate-btn {
        padding: 8px 20px;
        background: var(--vd-accent, #7c5cfc);
        color: #fff;
        border: none;
        border-radius: 4px;
        font-family: inherit;
        font-size: 14px;
        cursor: pointer;
      }

      .export-generate-btn:hover:not(:disabled) {
        opacity: 0.9;
      }

      .export-generate-btn:disabled {
        opacity: 0.4;
        cursor: default;
      }

      .export-cancel-btn {
        padding: 8px 20px;
        background: var(--vd-surface-2, #1e1e2a);
        color: var(--vd-text-dim);
        border: 1px solid var(--vd-border, #2a2a38);
        border-radius: 4px;
        font-family: inherit;
        font-size: 14px;
        cursor: pointer;
      }

      .export-cancel-btn:hover {
        color: var(--vd-text);
        border-color: var(--vd-error, #fc5c5c);
      }
    `;
    document.head.appendChild(style);
  }
}

export { ExportPanel };
