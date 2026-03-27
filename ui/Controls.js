/**
 * Controls — Reusable UI control components.
 *
 * Each factory function creates a self-contained DOM element with
 * value get/set and an onChange callback. Controls can be used
 * anywhere — stitch picker, layer config, selection inspector, etc.
 */

// ---------------------------------------------------------------------------
// Number Input
// ---------------------------------------------------------------------------

/**
 * Create a labeled number input control.
 *
 * @param {object} options
 * @param {string} options.label - Display label
 * @param {number} [options.value=0] - Initial value
 * @param {number} [options.min] - Minimum value
 * @param {number} [options.max] - Maximum value
 * @param {number} [options.step=1] - Step increment
 * @param {string} [options.suffix=''] - Suffix displayed after value (e.g. '°', '%')
 * @param {number} [options.decimals=0] - Decimal places to round to
 * @param {function} [options.onChange] - Called with (newValue: number)
 * @returns {{ el: HTMLElement, getValue: () => number, setValue: (v: number) => void }}
 */
function createNumberInput(options = {}) {
  const {
    label = '',
    value = 0,
    min,
    max,
    step = 1,
    suffix = '',
    decimals = 0,
    onChange,
  } = options;

  const box = document.createElement('div');
  box.className = 'vd-control vd-control-number';

  const lbl = document.createElement('span');
  lbl.className = 'vd-control-label';
  lbl.textContent = label;
  box.appendChild(lbl);

  const row = document.createElement('div');
  row.className = 'vd-control-row';

  const input = document.createElement('input');
  input.className = 'vd-control-input';
  input.type = 'number';
  if (min !== undefined) input.min = String(min);
  if (max !== undefined) input.max = String(max);
  input.step = String(step);
  input.value = String(value);
  row.appendChild(input);

  if (suffix) {
    const suf = document.createElement('span');
    suf.className = 'vd-control-suffix';
    suf.textContent = suffix;
    row.appendChild(suf);
  }

  box.appendChild(row);

  let currentValue = value;

  input.addEventListener('change', () => {
    let v = parseFloat(input.value) || 0;
    if (min !== undefined) v = Math.max(min, v);
    if (max !== undefined) v = Math.min(max, v);
    v = parseFloat(v.toFixed(decimals));
    currentValue = v;
    input.value = String(v);
    if (onChange) onChange(v);
  });

  return {
    el: box,
    getValue: () => currentValue,
    setValue: (v) => {
      if (min !== undefined) v = Math.max(min, v);
      if (max !== undefined) v = Math.min(max, v);
      v = parseFloat(v.toFixed(decimals));
      currentValue = v;
      input.value = String(v);
      input.placeholder = '';
    },
    /** Show "--" placeholder for mixed values */
    setMixed: () => {
      input.value = '';
      input.placeholder = '--';
    },
  };
}

// ---------------------------------------------------------------------------
// Color Picker
// ---------------------------------------------------------------------------

/**
 * Create a labeled color picker control.
 * Currently uses native <input type="color">. Future: full picker with presets.
 *
 * @param {object} options
 * @param {string} options.label - Display label
 * @param {string} [options.value='#ffffff'] - Initial hex color
 * @param {string[]} [options.presets] - Preset color swatches (future)
 * @param {function} [options.onChange] - Called with (newColor: string)
 * @returns {{ el: HTMLElement, getValue: () => string, setValue: (v: string) => void }}
 */
function createColorPicker(options = {}) {
  const {
    label = '',
    value = '#ffffff',
    presets = [],
    onChange,
  } = options;

  const box = document.createElement('div');
  box.className = 'vd-control vd-control-color';

  const lbl = document.createElement('span');
  lbl.className = 'vd-control-label';
  lbl.textContent = label;
  box.appendChild(lbl);

  const input = document.createElement('input');
  input.className = 'vd-color-input';
  input.type = 'color';
  input.value = value;
  box.appendChild(input);

  let currentValue = value;

  input.addEventListener('input', () => {
    currentValue = input.value;
    if (onChange) onChange(currentValue);
  });

  return {
    el: box,
    getValue: () => currentValue,
    setValue: (v) => {
      currentValue = v;
      input.value = v;
    },
  };
}

// ---------------------------------------------------------------------------
// Opacity Control
// ---------------------------------------------------------------------------

/**
 * Create a labeled opacity control (0-100%).
 *
 * @param {object} options
 * @param {string} options.label - Display label
 * @param {number} [options.value=100] - Initial value (0-100)
 * @param {function} [options.onChange] - Called with (newValue: number) where 0-100
 * @returns {{ el: HTMLElement, getValue: () => number, setValue: (v: number) => void, getNormalized: () => number }}
 */
function createOpacityControl(options = {}) {
  const {
    label = '',
    value = 100,
    onChange,
  } = options;

  const ctrl = createNumberInput({
    label,
    value,
    min: 0,
    max: 100,
    step: 5,
    suffix: '%',
    decimals: 0,
    onChange,
  });

  return {
    el: ctrl.el,
    getValue: () => ctrl.getValue(),
    setValue: (v) => ctrl.setValue(v),
    setMixed: () => ctrl.setMixed(),
    /** Returns opacity as 0-1 float */
    getNormalized: () => ctrl.getValue() / 100,
  };
}

// ---------------------------------------------------------------------------
// Radial Rotation Dial
// ---------------------------------------------------------------------------

/**
 * Create a radial rotation dial that overlays a target element.
 *
 * The dial appears as a ring around the target with snap-angle tick marks.
 * User drags around the ring to set rotation. Snap angles are configurable.
 *
 * @param {object} options
 * @param {HTMLElement} options.target - Element to overlay the dial around
 * @param {number} [options.value=0] - Initial rotation in degrees
 * @param {number[]} [options.snapAngles] - Angles to snap to
 * @param {number} [options.snapThreshold=6] - Snap distance in degrees
 * @param {number} [options.padding=20] - Dial extends this many px beyond target
 * @param {function} [options.onChange] - Called with (degrees: number)
 * @returns {{ el: HTMLCanvasElement, getValue: () => number, setValue: (deg: number) => void, redraw: () => void }}
 */
function createRadialDial(options = {}) {
  const {
    target,
    value = 0,
    snapAngles = [0, 30, 45, 60, 75, 90, 120, 135, 150, 180, 210, 225, 240, 270, 300, 315, 330],
    snapThreshold = 6,
    padding = 20,
    onChange,
  } = options;

  let currentValue = value;
  let dragging = false;
  let visible = false;

  const canvas = document.createElement('canvas');
  canvas.className = 'vd-dial-canvas';
  canvas.style.cssText = `
    position: absolute;
    inset: -${padding}px;
    width: calc(100% + ${padding * 2}px);
    height: calc(100% + ${padding * 2}px);
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.15s;
  `;

  // Size canvas for crisp rendering
  const resizeCanvas = () => {
    const rect = target.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height) + padding * 2;
    const dpr = Math.min(window.devicePixelRatio, 2);
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
  };

  const show = () => {
    visible = true;
    canvas.style.opacity = '1';
    canvas.style.pointerEvents = 'auto';
    resizeCanvas();
    draw();
  };

  const hide = () => {
    if (dragging) return;
    visible = false;
    canvas.style.opacity = '0';
    canvas.style.pointerEvents = 'none';
  };

  // Wrap target in relative container if not already
  if (target.parentElement) {
    target.parentElement.addEventListener('mouseenter', show);
    target.parentElement.addEventListener('mouseleave', hide);
  }

  const snapAngle = (deg) => {
    for (const snap of snapAngles) {
      const diff = Math.abs(deg - snap);
      if (diff < snapThreshold || Math.abs(diff - 360) < snapThreshold) return snap;
    }
    return deg;
  };

  const angleFromEvent = (e) => {
    const rect = canvas.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let deg = Math.atan2(e.clientX - cx, -(e.clientY - cy)) * 180 / Math.PI;
    return ((deg % 360) + 360) % 360;
  };

  canvas.addEventListener('pointerdown', (e) => {
    dragging = true;
    canvas.setPointerCapture(e.pointerId);
    currentValue = snapAngle(angleFromEvent(e));
    if (onChange) onChange(currentValue);
    draw();
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    currentValue = snapAngle(angleFromEvent(e));
    if (onChange) onChange(currentValue);
    draw();
  });

  canvas.addEventListener('pointerup', (e) => {
    dragging = false;
    canvas.releasePointerCapture(e.pointerId);
    // Check if mouse has left the target area
    const rect = target.parentElement.getBoundingClientRect();
    if (e.clientX < rect.left || e.clientX > rect.right ||
        e.clientY < rect.top || e.clientY > rect.bottom) {
      hide();
    }
  });

  function draw() {
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    const cx = w / 2;
    const cy = h / 2;
    // Radius sits right on the preview circle edge
    const r = (w / 2) - padding * Math.min(window.devicePixelRatio, 2);

    ctx.clearRect(0, 0, w, h);

    // Thin circle track
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Snap angle dots
    for (const angle of snapAngles) {
      const rad = (angle - 90) * Math.PI / 180;
      const isCardinal = angle % 90 === 0;
      const dotR = isCardinal ? 3 : 2;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(rad) * r, cy + Math.sin(rad) * r, dotR, 0, Math.PI * 2);
      ctx.fillStyle = isCardinal ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.15)';
      ctx.fill();
    }

    // Current angle — purple dot
    const curRad = (currentValue - 90) * Math.PI / 180;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(curRad) * r, cy + Math.sin(curRad) * r, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#7c5cfc';
    ctx.fill();
  }

  return {
    el: canvas,
    getValue: () => currentValue,
    setValue: (deg) => {
      currentValue = ((deg % 360) + 360) % 360;
      if (visible) draw();
    },
    redraw: draw,
  };
}

// ---------------------------------------------------------------------------
// Shared styles (injected once)
// ---------------------------------------------------------------------------

let stylesInjected = false;

function injectControlStyles() {
  if (stylesInjected) return;
  stylesInjected = true;

  const style = document.createElement('style');
  style.id = 'vd-controls-styles';
  style.textContent = `
    .vd-control {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 3px;
    }
    .vd-control-row {
      display: flex;
      align-items: center;
      gap: 2px;
    }
    .vd-control-label {
      font-size: 9px;
      color: var(--vd-text-muted);
      text-transform: uppercase;
      letter-spacing: 0.04em;
      font-family: 'Jost', sans-serif;
    }
    .vd-control-input {
      width: 48px;
      height: 24px;
      background: var(--vd-surface-2);
      color: var(--vd-text);
      border: 1px solid var(--vd-border);
      border-radius: 4px;
      font-family: 'Jost', sans-serif;
      font-size: 11px;
      text-align: center;
      outline: none;
      padding: 0 2px;
      -moz-appearance: textfield;
    }
    .vd-control-input::-webkit-inner-spin-button,
    .vd-control-input::-webkit-outer-spin-button {
      -webkit-appearance: none;
      margin: 0;
    }
    .vd-control-input:focus {
      border-color: var(--vd-accent);
    }
    .vd-control-suffix {
      font-size: 9px;
      color: var(--vd-text-muted);
      font-family: 'Jost', sans-serif;
      margin-top: -2px;
    }
    .vd-color-input {
      width: 48px;
      height: 24px;
      border: 1px solid var(--vd-border);
      border-radius: 4px;
      background: var(--vd-surface-2);
      cursor: pointer;
      padding: 0;
    }
  `;
  document.head.appendChild(style);
}

export {
  createNumberInput,
  createColorPicker,
  createOpacityControl,
  createRadialDial,
  injectControlStyles,
};
