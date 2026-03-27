/**
 * Base Command class and core commands.
 * Every user action that mutates data flows through HistoryManager as a Command.
 *
 * Subclasses must implement execute() and undo().
 * The description getter is used for UI display and debugging.
 */

/**
 * Abstract base class for all commands.
 * Subclasses must override execute() and undo().
 */
class Command {
  /**
   * Execute the command (apply the mutation).
   * @throws {Error} Always — subclasses must override
   */
  execute() {
    throw new Error('Subclass must implement execute()');
  }

  /**
   * Reverse the command (undo the mutation).
   * @throws {Error} Always — subclasses must override
   */
  undo() {
    throw new Error('Subclass must implement undo()');
  }

  /**
   * Human-readable description of what this command does.
   * @returns {string}
   */
  get description() {
    return 'Unknown command';
  }
}

/**
 * Sets a value in a State store. Captures the old value at construction
 * time so undo can restore it.
 *
 * @example
 *   const cmd = new SetValueCommand(state, 'tool', 'pen');
 *   cmd.execute(); // state.tool = 'pen'
 *   cmd.undo();    // state.tool = previous value
 */
class SetValueCommand extends Command {
  #state;
  #key;
  #newValue;
  #oldValue;

  /**
   * @param {import('./State.js').State} state - The State instance to mutate
   * @param {string} key - The state key to set
   * @param {*} newValue - The value to set
   */
  constructor(state, key, newValue) {
    super();
    this.#state = state;
    this.#key = key;
    this.#newValue = newValue;
    this.#oldValue = state.get(key);
  }

  execute() {
    this.#state.set(this.#key, this.#newValue);
  }

  undo() {
    this.#state.set(this.#key, this.#oldValue);
  }

  /** @returns {string} */
  get description() {
    return `Set ${this.#key} = ${this.#newValue}`;
  }
}

/**
 * Undoable layer opacity change.
 */
class LayerOpacityCommand extends Command {
  #layerManager;
  #layerName;
  #oldOpacity;
  #newOpacity;

  constructor(layerManager, layerName, oldOpacity, newOpacity) {
    super();
    this.#layerManager = layerManager;
    this.#layerName = layerName;
    this.#oldOpacity = oldOpacity;
    this.#newOpacity = newOpacity;
  }

  execute() { this.#layerManager.setOpacity(this.#layerName, this.#newOpacity); }
  undo()    { this.#layerManager.setOpacity(this.#layerName, this.#oldOpacity); }

  get description() {
    return `Set ${this.#layerName} opacity to ${Math.round(this.#newOpacity * 100)}%`;
  }
}

/**
 * Undoable layer visibility toggle.
 */
class LayerVisibilityCommand extends Command {
  #layerManager;
  #layerName;
  #oldVisible;
  #newVisible;

  constructor(layerManager, layerName, oldVisible, newVisible) {
    super();
    this.#layerManager = layerManager;
    this.#layerName = layerName;
    this.#oldVisible = oldVisible;
    this.#newVisible = newVisible;
  }

  execute() { this.#layerManager.setVisible(this.#layerName, this.#newVisible); }
  undo()    { this.#layerManager.setVisible(this.#layerName, this.#oldVisible); }

  get description() {
    return `${this.#newVisible ? 'Show' : 'Hide'} ${this.#layerName} layer`;
  }
}

/**
 * Place a stamp (stitch or text) on the canvas.
 */
class PlaceStampCommand extends Command {
  #store;
  #data;
  #id;

  constructor(store, data) {
    super();
    this.#store = store;
    this.#data = { ...data };
    this.#id = null;
  }

  execute() {
    const stitch = this.#store.add(this.#data);
    this.#id = stitch.id;
    this.#data.id = stitch.id; // preserve ID for redo
  }

  undo() {
    if (this.#id) this.#store.remove(this.#id);
  }

  get description() {
    return `Place ${this.#data.type === 'text' ? 'text' : this.#data.stitchType}`;
  }
}

/**
 * Remove one or more stamps from the canvas.
 */
class RemoveStampsCommand extends Command {
  #store;
  #ids;
  #removed; // full data for undo

  constructor(store, ids) {
    super();
    this.#store = store;
    this.#ids = [...ids];
    this.#removed = [];
  }

  execute() {
    this.#removed = [];
    for (const id of this.#ids) {
      const data = this.#store.remove(id);
      if (data) this.#removed.push(data);
    }
  }

  undo() {
    for (const data of this.#removed) {
      this.#store.add(data);
    }
  }

  get description() {
    return `Remove ${this.#removed.length} stamp(s)`;
  }
}

/**
 * Move one or more stamps. Stores old and new positions.
 */
class MoveStampsCommand extends Command {
  #store;
  #moves; // [{ id, oldPos: {x,y}, newPos: {x,y} }]

  constructor(store, moves) {
    super();
    this.#store = store;
    this.#moves = moves.map(m => ({
      id: m.id,
      oldPos: { ...m.oldPos },
      newPos: { ...m.newPos },
    }));
  }

  execute() {
    this.#store.batchUpdate(
      this.#moves.map(m => ({ id: m.id, props: { position: m.newPos } }))
    );
  }

  undo() {
    this.#store.batchUpdate(
      this.#moves.map(m => ({ id: m.id, props: { position: m.oldPos } }))
    );
  }

  get description() {
    return `Move ${this.#moves.length} stamp(s)`;
  }
}

/**
 * Rotate one or more stamps. Stores old and new rotations.
 */
class RotateStampsCommand extends Command {
  #store;
  #rotations; // [{ id, oldRot, newRot }]

  constructor(store, rotations) {
    super();
    this.#store = store;
    this.#rotations = rotations.map(r => ({ ...r }));
  }

  execute() {
    this.#store.batchUpdate(
      this.#rotations.map(r => ({ id: r.id, props: { rotation: r.newRot } }))
    );
  }

  undo() {
    this.#store.batchUpdate(
      this.#rotations.map(r => ({ id: r.id, props: { rotation: r.oldRot } }))
    );
  }

  get description() {
    return `Rotate ${this.#rotations.length} stamp(s)`;
  }
}

/**
 * Change z-order of stamps. Stores old z-indices for undo.
 */
class ReorderStampsCommand extends Command {
  #store;
  #oldZIndices; // Map<id, oldZIndex>
  #action; // 'front' | 'back' | 'forward' | 'backward'
  #ids;

  constructor(store, ids, action) {
    super();
    this.#store = store;
    this.#ids = [...ids];
    this.#action = action;
    // Capture current z-indices of ALL items (reorder can affect non-selected items)
    this.#oldZIndices = new Map();
    for (const s of store.getAll()) {
      this.#oldZIndices.set(s.id, s.zIndex);
    }
  }

  execute() {
    switch (this.#action) {
      case 'front':   this.#store.sendToFront(this.#ids); break;
      case 'back':    this.#store.sendToBack(this.#ids); break;
      case 'forward': this.#store.bringForward(this.#ids); break;
      case 'backward': this.#store.sendBackward(this.#ids); break;
    }
  }

  undo() {
    // Restore all z-indices
    const updates = [];
    for (const [id, z] of this.#oldZIndices) {
      updates.push({ id, props: { zIndex: z } });
    }
    this.#store.batchUpdate(updates);
  }

  get description() {
    return `${this.#action} ${this.#ids.length} stamp(s)`;
  }
}

export {
  Command,
  SetValueCommand,
  LayerOpacityCommand,
  LayerVisibilityCommand,
  PlaceStampCommand,
  RemoveStampsCommand,
  MoveStampsCommand,
  RotateStampsCommand,
  ReorderStampsCommand,
};
