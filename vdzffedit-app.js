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
import { ToolManager } from './ui/tools/ToolManager.js';
import { SelectTool } from './ui/tools/SelectTool.js';
import { StampTool } from './ui/tools/StampTool.js';
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
const transformControls = new TransformControls(bus, stitchStore, selectionManager, viewport.scene, viewport.camera);

viewport.setStitchRenderer(stitchRenderer);
stitchPicker.setSelectionEditing(selectionManager, stitchStore, history);

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
  controls: viewport.controls,
  canvas: viewport.domElement,
  screenToWorld: viewport.screenToWorld.bind(viewport),
});

const selectTool = new SelectTool();
const stampTool = new StampTool(PlaceStampCommand);

toolManager.register(selectTool);
toolManager.register(stampTool);
toolManager.setActive('select');

// Auto-switch between select and stamp based on picker state
bus.on('stitch:active-changed', ({ stitchId }) => {
  toolManager.setActive(stitchId ? 'stamp' : 'select');
});

// ============================================================
// Keyboard manager (extensible, remappable)
// ============================================================

const keyboard = new KeyboardManager();

// --- Undo / Redo ---
keyboard.register({ key: 'Ctrl+Z', action: () => history.undo(), label: 'Undo', category: 'edit' });
keyboard.register({ key: 'Ctrl+Shift+Z', action: () => history.redo(), label: 'Redo', category: 'edit' });
keyboard.register({ key: 'Ctrl+Y', action: () => history.redo(), label: 'Redo (alt)', category: 'edit' });

// --- Selection ---
keyboard.register({
  key: 'Delete', label: 'Delete selected', category: 'edit',
  when: () => selectionManager.hasSelection,
  action: () => {
    history.execute(new RemoveStampsCommand(stitchStore, selectionManager.selectedArray));
    selectionManager.deselectAll();
  },
});
keyboard.register({
  key: 'Backspace', label: 'Delete selected (alt)', category: 'edit',
  when: () => selectionManager.hasSelection,
  action: () => {
    history.execute(new RemoveStampsCommand(stitchStore, selectionManager.selectedArray));
    selectionManager.deselectAll();
  },
});
keyboard.register({ key: 'Ctrl+A', label: 'Select all', category: 'edit', action: () => selectionManager.selectMultiple(stitchStore.getAllIds()) });
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
keyboard.register({ key: 'ArrowUp', label: 'Nudge up', category: 'edit', when: () => selectionManager.hasSelection, action: () => nudge(0, 1) });
keyboard.register({ key: 'ArrowDown', label: 'Nudge down', category: 'edit', when: () => selectionManager.hasSelection, action: () => nudge(0, -1) });
keyboard.register({ key: 'ArrowLeft', label: 'Nudge left', category: 'edit', when: () => selectionManager.hasSelection, action: () => nudge(-1, 0) });
keyboard.register({ key: 'ArrowRight', label: 'Nudge right', category: 'edit', when: () => selectionManager.hasSelection, action: () => nudge(1, 0) });

// --- Panels ---
keyboard.register({ key: 'S', label: 'Toggle stitch picker', category: 'panels', action: () => stitchPicker.toggle() });

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

btnSettings.addEventListener('click', () => settingsPanel.classList.toggle('open'));
settingsClose.addEventListener('click', () => settingsPanel.classList.remove('open'));

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
document.getElementById('setting-sel-color').addEventListener('input', (e) => state.set('selectionColor', e.target.value));

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
  toolManager, keyboard,
};

console.log('[VDZ] Freeform editor initialized');
