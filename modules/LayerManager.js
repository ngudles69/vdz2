import * as THREE from 'three';

/**
 * Central registry for all visual layers in the Three.js scene.
 *
 * Each layer is a named THREE.Group with a defined renderOrder (z-index),
 * independent visibility/opacity state, and EventBus integration.
 */

const Z_BACKGROUND = 0;
const Z_IMAGE      = 200;
const Z_VIDEO      = 300;
const Z_STITCHES   = 400;

const LAYER_DEFS = [
  { name: 'background', z: Z_BACKGROUND, label: 'Background', defaultOpacity: 1.0 },
  { name: 'image',      z: Z_IMAGE,      label: 'Image',      defaultOpacity: 0.3 },
  { name: 'video',      z: Z_VIDEO,      label: 'Video',      defaultOpacity: 1.0 },
  { name: 'stitches',   z: Z_STITCHES,   label: 'Stitches',   defaultOpacity: 1.0 },
];

class LayerManager {
  static Z_BACKGROUND = Z_BACKGROUND;
  static Z_IMAGE      = Z_IMAGE;
  static Z_VIDEO      = Z_VIDEO;
  static Z_STITCHES   = Z_STITCHES;

  /** @type {import('../core/EventBus.js').EventBus} */
  #bus;

  /** @type {THREE.Scene} */
  #scene;

  /** @type {Map<string, { group: THREE.Group, visible: boolean, opacity: number, locked: boolean, z: number, label: string }>} */
  #layers = new Map();

  /**
   * @param {import('../core/EventBus.js').EventBus} bus
   * @param {THREE.Scene} scene
   */
  constructor(bus, scene) {
    this.#bus = bus;
    this.#scene = scene;
    this.#initLayers();
  }

  #initLayers() {
    for (const def of LAYER_DEFS) {
      const group = new THREE.Group();
      group.name = `layer:${def.name}`;
      group.renderOrder = def.z;

      this.#scene.add(group);

      const opacity = def.defaultOpacity ?? 1.0;
      this.#layers.set(def.name, {
        group,
        visible: true,
        opacity,
        locked: false,
        z: def.z,
        label: def.label,
      });
    }
  }

  getGroup(name) {
    const entry = this.#layers.get(name);
    if (!entry) throw new Error(`Unknown layer: "${name}"`);
    return entry.group;
  }

  setVisible(name, visible) {
    const entry = this.#layers.get(name);
    if (!entry) throw new Error(`Unknown layer: "${name}"`);

    entry.visible = visible;
    entry.group.visible = visible;

    this.#bus.emit('layer:visibility-changed', { name, visible });
  }

  isVisible(name) {
    const entry = this.#layers.get(name);
    if (!entry) throw new Error(`Unknown layer: "${name}"`);
    return entry.visible;
  }

  setOpacity(name, opacity) {
    const entry = this.#layers.get(name);
    if (!entry) throw new Error(`Unknown layer: "${name}"`);

    opacity = Math.max(0, Math.min(1, opacity));

    const oldOpacity = entry.opacity;
    entry.opacity = opacity;

    entry.group.traverse((obj) => {
      if (obj.material) {
        if (obj.material.uniforms && obj.material.uniforms.uLayerOpacity) {
          obj.material.uniforms.uLayerOpacity.value = opacity;
        } else {
          obj.material.opacity = opacity;
          obj.material.transparent = opacity < 1.0;
        }
        obj.material.needsUpdate = true;
      }
    });

    this.#bus.emit('layer:opacity-changed', { name, opacity, oldOpacity });
  }

  getOpacity(name) {
    const entry = this.#layers.get(name);
    if (!entry) throw new Error(`Unknown layer: "${name}"`);
    return entry.opacity;
  }

  setLocked(name, locked) {
    const entry = this.#layers.get(name);
    if (!entry) throw new Error(`Unknown layer: "${name}"`);

    entry.locked = locked;
    this.#bus.emit('layer:lock-changed', { name, locked });
  }

  isLocked(name) {
    const entry = this.#layers.get(name);
    if (!entry) throw new Error(`Unknown layer: "${name}"`);
    return entry.locked;
  }

  /**
   * Returns array of layer info sorted by z descending (top-to-bottom for UI).
   */
  getLayers() {
    const result = [];
    for (const [name, entry] of this.#layers) {
      result.push({
        name,
        label: entry.label,
        visible: entry.visible,
        opacity: entry.opacity,
        locked: entry.locked,
        z: entry.z,
      });
    }
    result.sort((a, b) => b.z - a.z);
    return result;
  }

  saveState() {
    const visibility = {};
    const opacity = {};
    const locked = {};

    for (const [name, entry] of this.#layers) {
      visibility[name] = entry.visible;
      opacity[name] = entry.opacity;
      locked[name] = entry.locked;
    }

    return { visibility, opacity, locked };
  }

  loadState(state) {
    if (!state) return;

    if (state.visibility) {
      for (const [name, visible] of Object.entries(state.visibility)) {
        if (this.#layers.has(name)) this.setVisible(name, visible);
      }
    }

    if (state.opacity) {
      for (const [name, opacity] of Object.entries(state.opacity)) {
        if (this.#layers.has(name)) this.setOpacity(name, opacity);
      }
    }

    if (state.locked) {
      for (const [name, locked] of Object.entries(state.locked)) {
        if (this.#layers.has(name)) this.setLocked(name, locked);
      }
    }
  }
}

export { LayerManager };
