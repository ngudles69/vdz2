import { EventBus } from './core/EventBus.js';
import { State } from './core/State.js';
import { HistoryManager } from './core/HistoryManager.js';
import { toast } from './core/Toast.js';
import { Viewport } from './ui/Viewport.js';
import { LayerManager } from './modules/LayerManager.js';
import { ImageOverlay } from './modules/ImageOverlay.js';
import { LayerPanel } from './ui/LayerPanel.js';
import { StitchLibrary } from './modules/StitchLibrary.js';
import { StitchAtlas } from './modules/StitchAtlas.js';
import { StitchPicker } from './ui/StitchPicker.js';
import { StitchStore } from './modules/StitchStore.js';
import { StitchRenderer } from './modules/StitchRenderer.js';
import { SelectionManager } from './ui/SelectionManager.js';
import { TransformControls } from './ui/TransformControls.js';
import { StitchTransformTarget, ImageTransformTarget } from './ui/TransformTarget.js';
import { SetManager } from './modules/SetManager.js';
import { SetBar } from './ui/SetBar.js';
import { ToolManager } from './ui/tools/ToolManager.js';
import { SelectTool } from './ui/tools/SelectTool.js';
import { StampTool } from './ui/tools/StampTool.js';
import { TextTool } from './ui/tools/TextTool.js';
import { AlignPanel } from './ui/AlignPanel.js';
import { TextToolbar } from './ui/TextToolbar.js';
import { KeyboardManager } from './ui/KeyboardManager.js';
import {
  PlaceStampCommand,
  RemoveStampsCommand,
  MoveStampsCommand,
  RotateStampsCommand,
} from './core/Commands.js';

// ============================================================
// Core singletons
// ============================================================

const bus = new EventBus();
const state = new State();
const history = new HistoryManager(bus);

// ============================================================
// Viewport (pure rendering — no pointer events)
// ============================================================

const viewport = new Viewport(bus, state, document.getElementById('canvas-container'));

// ============================================================
// Layer system
// ============================================================

const layerManager = new LayerManager(bus, viewport.scene);
viewport.setLayerManager(layerManager);

const imageOverlay = new ImageOverlay(bus, layerManager);
imageOverlay.setCamera(viewport.camera);

const layerPanel = new LayerPanel(bus, layerManager, viewport, imageOverlay, history);

// ============================================================
// Stitch library, atlas, picker
// ============================================================

const stitchLibrary = new StitchLibrary();
const stitchAtlas = new StitchAtlas(stitchLibrary);
stitchAtlas.generate();
const stitchPicker = new StitchPicker(bus, state, stitchLibrary);

// ============================================================
// Stamp data + rendering + selection
// ============================================================

const stitchStore = new StitchStore(bus);
const selectionManager = new SelectionManager(bus);
const stitchRenderer = new StitchRenderer(bus, stitchStore, stitchLibrary, stitchAtlas, layerManager);
const transformControls = new TransformControls(bus, viewport.scene, viewport.camera);
const stitchTarget = new StitchTransformTarget(stitchStore, selectionManager);
stitchTarget.setRenderer(stitchRenderer);
const imageTarget = new ImageTransformTarget(imageOverlay);

const setManager = new SetManager(bus, stitchStore);
stitchRenderer.setSetManager(setManager);

viewport.setStitchRenderer(stitchRenderer);
stitchPicker.setSelectionEditing(selectionManager, stitchStore, history);

const setBar = new SetBar(bus, setManager, selectionManager);

// Deselect all when stitches layer is locked
bus.on('layer:lock-changed', ({ name, locked }) => {
  if (name === 'stitches' && locked) {
    selectionManager.deselectAll();
    transformControls.clearTarget();
  }
});

// When stitch selection changes, update transform controls
bus.on('selection:changed', () => {
  if (selectionManager.hasSelection) {
    transformControls.setTarget(stitchTarget);
  } else {
    // Only clear if current target is stitch target
    if (transformControls.target === stitchTarget) {
      transformControls.clearTarget();
    }
  }
});

// When a selected stitch is removed, refresh
bus.on('stitch-store:removed', ({ stitch }) => {
  if (selectionManager.isSelected(stitch.id)) {
    if (selectionManager.hasSelection) {
      transformControls.refreshBounds();
    } else {
      transformControls.clearTarget();
    }
  }
});

// ============================================================
// Tool system
// ============================================================

const toolManager = new ToolManager({
  bus, state, history,
  store: stitchStore,
  selection: selectionManager,
  transform: transformControls,
  renderer: stitchRenderer,
  viewport,
  stitchPicker,
  imageOverlay,
  layerManager,
  stitchTarget,
  imageTarget,
  controls: viewport.controls,
  canvas: viewport.domElement,
  screenToWorld: viewport.screenToWorld.bind(viewport),
});

const selectTool = new SelectTool();
const stampTool = new StampTool(PlaceStampCommand);
const textTool = new TextTool(PlaceStampCommand);

toolManager.register(selectTool);
toolManager.register(stampTool);
toolManager.register(textTool);
toolManager.setActive('select');

// Text toolbar
const textToolbar = new TextToolbar(bus, state, selectionManager, stitchStore, history);

// Track active tool in state for UI coordination
bus.on('tool:changed', ({ id }) => state.set('activeTool', id));

// Auto-switch between select and stamp based on picker state
bus.on('stitch:active-changed', ({ stitchId }) => {
  if (toolManager.activeToolId === 'text') return; // don't override text tool
  toolManager.setActive(stitchId ? 'stamp' : 'select');
});

// ============================================================
// Keyboard manager (extensible, remappable)
// ============================================================

const keyboard = new KeyboardManager();

/** True when stitches layer is unlocked and there's a selection */
const canEditStitches = () => !layerManager.isLocked('stitches') && selectionManager.hasSelection;

// --- Undo / Redo ---
keyboard.register({ key: 'Ctrl+Z', action: () => history.undo(), label: 'Undo', category: 'edit' });
keyboard.register({ key: 'Ctrl+Shift+Z', action: () => history.redo(), label: 'Redo', category: 'edit' });
keyboard.register({ key: 'Ctrl+Y', action: () => history.redo(), label: 'Redo (alt)', category: 'edit' });

// --- Clipboard (copy/paste/duplicate) ---
let clipboard = [];

keyboard.register({
  key: 'Ctrl+C', label: 'Copy', category: 'edit',
  when: canEditStitches,
  action: () => {
    const ids = selectionManager.selectedArray;
    const stamps = stitchStore.getByIds(ids);
    // Compute center of selection for relative paste
    let cx = 0, cy = 0;
    for (const s of stamps) { cx += s.position.x; cy += s.position.y; }
    cx /= stamps.length; cy /= stamps.length;
    // Store deep copies with positions relative to center
    clipboard = stamps.map(s => ({
      type: s.type,
      stitchType: s.stitchType,
      text: s.text,
      textStyle: s.textStyle ? { ...s.textStyle } : null,
      dx: s.position.x - cx,
      dy: s.position.y - cy,
      rotation: s.rotation,
      scale: s.scale ?? 1,
      colorOverride: s.colorOverride,
      opacity: s.opacity,
    }));
    toast(`Copied ${clipboard.length} stamp(s)`);
  },
});

keyboard.register({
  key: 'Ctrl+X', label: 'Cut', category: 'edit',
  when: canEditStitches,
  action: () => {
    const ids = selectionManager.selectedArray;
    const stamps = stitchStore.getByIds(ids);
    let cx = 0, cy = 0;
    for (const s of stamps) { cx += s.position.x; cy += s.position.y; }
    cx /= stamps.length; cy /= stamps.length;
    clipboard = stamps.map(s => ({
      type: s.type, stitchType: s.stitchType, text: s.text,
      textStyle: s.textStyle ? { ...s.textStyle } : null,
      dx: s.position.x - cx, dy: s.position.y - cy,
      rotation: s.rotation, scale: s.scale ?? 1,
      colorOverride: s.colorOverride, opacity: s.opacity,
    }));
    history.execute(new RemoveStampsCommand(stitchStore, ids));
    selectionManager.deselectAll();
    toast(`Cut ${clipboard.length} stamp(s)`);
  },
});

keyboard.register({
  key: 'Ctrl+V', label: 'Paste', category: 'edit',
  when: () => clipboard.length > 0,
  action: () => {
    // Paste at a small offset from original position
    const offset = 20;
    history.beginBatch();
    const newIds = [];
    for (const item of clipboard) {
      const data = {
        type: item.type,
        stitchType: item.stitchType,
        text: item.text,
        textStyle: item.textStyle,
        position: { x: item.dx + offset, y: item.dy + offset },
        rotation: item.rotation,
        scale: item.scale,
        colorOverride: item.colorOverride,
        opacity: item.opacity,
      };
      const cmd = new PlaceStampCommand(stitchStore, data);
      history.execute(cmd);
      // Get the ID of the just-placed stamp
      const all = stitchStore.getAll();
      newIds.push(all[all.length - 1].id);
    }
    history.endBatch('Paste stamps');
    // Select the pasted stamps
    selectionManager.selectMultiple(newIds);
    toast(`Pasted ${clipboard.length} stamp(s)`);
  },
});

keyboard.register({
  key: 'Ctrl+D', label: 'Duplicate', category: 'edit',
  when: canEditStitches,
  action: () => {
    const ids = selectionManager.selectedArray;
    const stamps = stitchStore.getByIds(ids);
    const offset = 15;
    history.beginBatch();
    const newIds = [];
    for (const s of stamps) {
      const data = {
        type: s.type,
        stitchType: s.stitchType,
        text: s.text,
        textStyle: s.textStyle,
        position: { x: s.position.x + offset, y: s.position.y - offset },
        rotation: s.rotation,
        scale: s.scale ?? 1,
        colorOverride: s.colorOverride,
        opacity: s.opacity,
      };
      const cmd = new PlaceStampCommand(stitchStore, data);
      history.execute(cmd);
      const all = stitchStore.getAll();
      newIds.push(all[all.length - 1].id);
    }
    history.endBatch('Duplicate stamps');
    selectionManager.selectMultiple(newIds);
    toast(`Duplicated ${stamps.length} stamp(s)`);
  },
});

// --- Selection ---
keyboard.register({
  key: 'Delete', label: 'Delete selected', category: 'edit',
  when: canEditStitches,
  action: () => {
    history.execute(new RemoveStampsCommand(stitchStore, selectionManager.selectedArray));
    selectionManager.deselectAll();
  },
});
keyboard.register({
  key: 'Backspace', label: 'Delete selected (alt)', category: 'edit',
  when: canEditStitches,
  action: () => {
    history.execute(new RemoveStampsCommand(stitchStore, selectionManager.selectedArray));
    selectionManager.deselectAll();
  },
});
keyboard.register({
  key: 'X', label: 'Delete selected (X)', category: 'edit',
  when: canEditStitches,
  action: () => {
    history.execute(new RemoveStampsCommand(stitchStore, selectionManager.selectedArray));
    selectionManager.deselectAll();
  },
});
keyboard.register({ key: 'Ctrl+A', label: 'Select all', category: 'edit', when: () => !layerManager.isLocked('stitches'), action: () => selectionManager.selectMultiple(stitchStore.getAllIds()) });
keyboard.register({ key: 'Escape', label: 'Deselect all', category: 'edit', action: () => selectionManager.deselectAll() });

// --- Nudge ---
const nudge = (dx, dy) => {
  if (!selectionManager.hasSelection) return;
  const step = viewport.gridVisible ? viewport.gridSpacing : 1;
  const moves = [];
  for (const id of selectionManager.selectedIds) {
    const s = stitchStore.getById(id);
    if (s) moves.push({ id, oldPos: { ...s.position }, newPos: { x: s.position.x + dx * step, y: s.position.y + dy * step } });
  }
  if (moves.length) history.execute(new MoveStampsCommand(stitchStore, moves));
};
keyboard.register({ key: 'ArrowUp', label: 'Nudge up', category: 'edit', when: canEditStitches, action: () => nudge(0, 1) });
keyboard.register({ key: 'ArrowDown', label: 'Nudge down', category: 'edit', when: canEditStitches, action: () => nudge(0, -1) });
keyboard.register({ key: 'ArrowLeft', label: 'Nudge left', category: 'edit', when: canEditStitches, action: () => nudge(-1, 0) });
keyboard.register({ key: 'ArrowRight', label: 'Nudge right', category: 'edit', when: canEditStitches, action: () => nudge(1, 0) });

// --- Save / Load ---
async function saveProject() {
  const project = {
    version: 1,
    stamps: stitchStore.exportJSON(),
    layers: layerManager.saveState(),
    grid: {
      visible: viewport.gridVisible,
      spacing: viewport.gridSpacing,
      opacity: viewport.gridOpacity,
    },
    background: viewport.backgroundType,
    sets: setManager.exportJSON(),
  };
  const json = JSON.stringify(project, null, 2);

  // Use File System Access API if available (shows save dialog)
  if (window.showSaveFilePicker) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: 'violet-drizzle-project.json',
        types: [{ description: 'JSON File', accept: { 'application/json': ['.json'] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(json);
      await writable.close();
      toast('Project saved');
      return;
    } catch (err) {
      if (err.name === 'AbortError') return; // user cancelled
      console.warn('File System API failed, falling back:', err);
    }
  }

  // Fallback: direct download
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'violet-drizzle-project.json';
  a.click();
  URL.revokeObjectURL(url);
  toast('Project saved');
}

function loadProject() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.addEventListener('change', () => {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const project = JSON.parse(reader.result);
        if (!project.version || !project.stamps) {
          toast('Invalid project file');
          return;
        }
        // Clear current state
        selectionManager.deselectAll();
        history.clear();

        // Restore stamps
        stitchStore.importJSON(project.stamps);

        // Restore layers
        if (project.layers) layerManager.loadState(project.layers);

        // Restore grid
        if (project.grid) {
          viewport.setGridVisible(project.grid.visible ?? false);
          viewport.setGridSize(project.grid.spacing ?? 20);
          viewport.setGridOpacity(project.grid.opacity ?? 0.15);
          document.getElementById('setting-grid').checked = project.grid.visible ?? false;
          document.getElementById('setting-grid-size').value = project.grid.spacing ?? 20;
          document.getElementById('setting-grid-opacity').value = Math.round((project.grid.opacity ?? 0.15) * 100);
        }

        // Restore background
        if (project.background) viewport.setBackground(project.background);
        if (project.sets) setManager.importJSON(project.sets);

        toast('Project loaded');
      } catch (err) {
        console.error('Failed to load project:', err);
        toast('Failed to load project');
      }
    };
    reader.readAsText(file);
  });
  input.click();
}

keyboard.register({ key: 'Ctrl+S', label: 'Save project', category: 'file', action: () => saveProject() });
keyboard.register({ key: 'Ctrl+O', label: 'Open project', category: 'file', action: () => loadProject() });

// --- Toolbar buttons ---
document.getElementById('btn-save').addEventListener('click', () => saveProject());
document.getElementById('btn-load').addEventListener('click', () => loadProject());

// Text tool button
const btnTextTool = document.getElementById('btn-text-tool');
btnTextTool.addEventListener('click', () => {
  if (toolManager.activeToolId === 'text') {
    toolManager.setActive('select');
  } else {
    state.set('activeStitch', null);
    bus.emit('stitch:active-changed', { stitchId: null });
    toolManager.setActive('text');
  }
});
bus.on('tool:changed', ({ id }) => {
  btnTextTool.classList.toggle('active', id === 'text');
});

// Align panel
const alignPanel = new AlignPanel(bus, stitchStore, selectionManager, viewport, history);
const btnAlign = document.getElementById('btn-align');
btnAlign.addEventListener('click', () => alignPanel.toggle());
bus.on('selection:changed', ({ ids }) => {
  btnAlign.disabled = ids.length === 0;
  if (ids.length === 0) alignPanel.hide();
});

const btnGridToggle = document.getElementById('btn-grid-toggle');
const btnRulerToggle = document.getElementById('btn-ruler-toggle');

btnGridToggle.addEventListener('click', () => {
  const on = !viewport.gridVisible;
  viewport.setGridVisible(on);
  btnGridToggle.classList.toggle('active', on);
  document.getElementById('setting-grid').checked = on;
});

btnRulerToggle.addEventListener('click', () => {
  const on = !viewport.rulerVisible;
  viewport.setRulerVisible(on);
  btnRulerToggle.classList.toggle('active', on);
  document.getElementById('setting-ruler').checked = on;
});

// --- Theme toggle ---
const btnTheme = document.getElementById('btn-theme-toggle');
btnTheme.addEventListener('click', () => {
  const isLight = document.body.classList.toggle('light-theme');
  btnTheme.querySelector('.material-symbols-rounded').textContent = isLight ? 'dark_mode' : 'light_mode';
});

// --- Set visibility (1-9 toggle, 0 show/hide all) ---
for (let i = 1; i <= 9; i++) {
  keyboard.register({
    key: String(i),
    label: `Toggle set ${i} visibility`,
    category: 'sets',
    action: () => setManager.toggleVisibility(i),
  });
}
keyboard.register({
  key: '0',
  label: 'Toggle all sets visibility',
  category: 'sets',
  action: () => {
    if (setManager.allVisible()) setManager.hideAll();
    else setManager.showAll();
  },
});

// --- Set assignment (Ctrl+1-9 assign, Ctrl+0 unassign) ---
for (let i = 0; i <= 9; i++) {
  keyboard.register({
    key: `Ctrl+${i}`,
    label: i === 0 ? 'Unassign from set' : `Assign to set ${i}`,
    category: 'sets',
    when: canEditStitches,
    action: () => {
      const ids = selectionManager.selectedArray;
      if (i === 0) {
        setManager.unassign(ids);
        toast('Unassigned from set');
      } else {
        setManager.assign(ids, i);
        toast(`Assigned to set ${i}`);
      }
    },
  });
}

// --- Panels ---
document.getElementById('btn-stitch-toggle').addEventListener('click', () => stitchPicker.toggle());
keyboard.register({ key: 'S', label: 'Toggle stitch picker', category: 'panels', action: () => stitchPicker.toggle() });
keyboard.register({ key: 'T', label: 'Text tool', category: 'tools', action: () => {
  if (toolManager.activeToolId === 'text') {
    toolManager.setActive('select');
  } else {
    // Clear active stitch so stamp tool doesn't interfere
    state.set('activeStitch', null);
    bus.emit('stitch:active-changed', { stitchId: null });
    toolManager.setActive('text');
  }
}});
keyboard.register({ key: 'L', label: 'Toggle layers', category: 'panels', action: () => {
  layerPanelEl.style.display = layerPanelEl.style.display !== 'none' ? 'none' : 'block';
}});

// ============================================================
// Header buttons (undo/redo)
// ============================================================

const btnUndo = document.getElementById('btn-undo');
const btnRedo = document.getElementById('btn-redo');

bus.on('history:changed', ({ canUndo, canRedo }) => {
  btnUndo.disabled = !canUndo;
  btnRedo.disabled = !canRedo;
});

btnUndo.addEventListener('click', () => history.undo());
btnRedo.addEventListener('click', () => history.redo());

// ============================================================
// Settings panel
// ============================================================

const btnSettings = document.getElementById('btn-settings');
const settingsPanel = document.getElementById('settings-panel');
const settingsClose = document.getElementById('settings-close');

btnSettings.addEventListener('click', () => {
  settingsPanel.classList.toggle('open');
  if (settingsPanel.classList.contains('open')) {
    const rect = btnSettings.getBoundingClientRect();
    settingsPanel.style.top = `${rect.bottom + 8}px`;
  }
});
settingsClose.addEventListener('click', () => settingsPanel.classList.remove('open'));

// Close settings panel when clicking on the canvas (not layers or stitch picker — those are toggles)
viewport.domElement.addEventListener('pointerdown', () => {
  settingsPanel.classList.remove('open');
});

document.getElementById('setting-grid').addEventListener('change', (e) => viewport.setGridVisible(e.target.checked));
document.getElementById('setting-grid-size').addEventListener('change', (e) => {
  const s = parseInt(e.target.value);
  viewport.setGridSize(s);
  stitchStore.reflowGrid(s);
});
document.getElementById('setting-grid-opacity').addEventListener('change', (e) => viewport.setGridOpacity(parseInt(e.target.value) / 100));
document.getElementById('setting-grid-color').addEventListener('input', (e) => viewport.setGridColor(e.target.value));
document.getElementById('setting-ruler').addEventListener('change', (e) => viewport.setRulerVisible(e.target.checked));
document.getElementById('setting-ruler-opacity').addEventListener('change', (e) => viewport.setRulerOpacity(parseInt(e.target.value) / 100));
document.getElementById('setting-stitch-scale').addEventListener('change', (e) => state.set('stitchScale', parseFloat(e.target.value)));
document.getElementById('setting-sel-color').addEventListener('input', (e) => {
  state.set('selectionColor', e.target.value);
  stitchRenderer.setSelectionColor(e.target.value);
  transformControls.setSelectionColor(e.target.value);
});

// ============================================================
// Layers panel toggle
// ============================================================

const btnLayers = document.getElementById('btn-layers');
const layerPanelEl = document.getElementById('layer-panel');
btnLayers.addEventListener('click', () => {
  layerPanelEl.style.display = layerPanelEl.style.display !== 'none' ? 'none' : 'block';
});

// ============================================================
// Init
// ============================================================

toast('Freeform editor ready');

window.__vdz = {
  bus, state, history, viewport, layerManager, imageOverlay,
  stitchLibrary, stitchAtlas, stitchPicker,
  stitchStore, stitchRenderer, selectionManager, transformControls,
  toolManager, keyboard, setManager, textToolbar,
};

console.log('[VDZ] Freeform editor initialized');
