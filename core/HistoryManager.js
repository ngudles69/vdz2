/**
 * Command stack with undo/redo and batch grouping.
 * Receives an EventBus instance via constructor injection and emits
 * history:changed, history:undo, and history:redo events.
 *
 * @example
 *   const history = new HistoryManager(bus);
 *   history.execute(new SetValueCommand(state, 'tool', 'pen'));
 *   history.undo();  // reverts to previous tool
 *   history.redo();  // re-applies 'pen'
 *
 *   // Batch: groups multiple commands into one undo step
 *   history.beginBatch();
 *   history.execute(cmd1);
 *   history.execute(cmd2);
 *   history.endBatch('Move vertices');
 *   history.undo();  // undoes both cmd2 and cmd1 (LIFO)
 */

import { Command } from './Commands.js';

/**
 * Internal compound command used by batch grouping.
 * Not exported — created by endBatch().
 */
class BatchCommand extends Command {
  #commands;
  #description;

  /**
   * @param {Command[]} commands - Array of commands in execution order
   * @param {string} description - Human-readable batch description
   */
  constructor(commands, description) {
    super();
    this.#commands = commands;
    this.#description = description;
  }

  /** Execute all commands in order. */
  execute() {
    for (const cmd of this.#commands) {
      cmd.execute();
    }
  }

  /** Undo all commands in reverse order (LIFO). */
  undo() {
    for (let i = this.#commands.length - 1; i >= 0; i--) {
      this.#commands[i].undo();
    }
  }

  /** @returns {string} */
  get description() {
    return this.#description;
  }
}

class HistoryManager {
  /** @type {import('./EventBus.js').EventBus} */
  #bus;

  /** @type {Command[]} */
  #undoStack = [];

  /** @type {Command[]} */
  #redoStack = [];

  /** @type {Command[]|null} null = not batching, array = collecting */
  #batchStack = null;

  /**
   * @param {import('./EventBus.js').EventBus} eventBus - EventBus instance for emitting history events
   */
  constructor(eventBus) {
    this.#bus = eventBus;
  }

  /**
   * Execute a command. If batching, the command is collected into the
   * current batch. Otherwise it is pushed onto the undo stack and the
   * redo stack is cleared.
   * @param {Command} command
   */
  execute(command) {
    command.execute();

    if (this.#batchStack !== null) {
      this.#batchStack.push(command);
      return;
    }

    this.#undoStack.push(command);
    this.#redoStack.length = 0;
    this.#emitChanged();
  }

  /**
   * Undo the last command. Moves it from undo stack to redo stack.
   * No-op if undo stack is empty.
   */
  undo() {
    const cmd = this.#undoStack.pop();
    if (!cmd) return;

    cmd.undo();
    this.#redoStack.push(cmd);
    this.#emitChanged();
    this.#bus.emit('history:undo', { command: cmd });
  }

  /**
   * Redo the last undone command. Moves it from redo stack to undo stack.
   * No-op if redo stack is empty.
   */
  redo() {
    const cmd = this.#redoStack.pop();
    if (!cmd) return;

    cmd.execute();
    this.#undoStack.push(cmd);
    this.#emitChanged();
    this.#bus.emit('history:redo', { command: cmd });
  }

  /**
   * Begin collecting commands into a batch. Commands executed after this
   * call are held in a temporary buffer until endBatch() is called.
   */
  beginBatch() {
    this.#batchStack = [];
  }

  /**
   * End batch collection. Creates a compound command from all collected
   * commands, pushes it onto the undo stack, and clears the redo stack.
   * @param {string} [description='Batch operation'] - Human-readable description
   */
  endBatch(description = 'Batch operation') {
    if (this.#batchStack === null) return;

    const commands = this.#batchStack;
    this.#batchStack = null;

    if (commands.length === 0) return;

    const batch = new BatchCommand(commands, description);
    this.#undoStack.push(batch);
    this.#redoStack.length = 0;
    this.#emitChanged();
  }

  /**
   * Whether there are commands to undo.
   * @returns {boolean}
   */
  get canUndo() {
    return this.#undoStack.length > 0;
  }

  /**
   * Whether there are commands to redo.
   * @returns {boolean}
   */
  get canRedo() {
    return this.#redoStack.length > 0;
  }

  /**
   * Clear both undo and redo stacks.
   */
  clear() {
    this.#undoStack.length = 0;
    this.#redoStack.length = 0;
    this.#emitChanged();
  }

  /** Emit the history:changed event with current stack state. */
  #emitChanged() {
    this.#bus.emit('history:changed', {
      canUndo: this.canUndo,
      canRedo: this.canRedo
    });
  }
}

export { HistoryManager };
