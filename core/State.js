/**
 * Reactive key-value store for UI state.
 * Watchers are notified only when a value actually changes (strict equality).
 *
 * @example
 *   const state = new State();
 *   const unwatch = state.watch('tool', (newVal, oldVal) => {
 *     console.log(`tool changed from ${oldVal} to ${newVal}`);
 *   });
 *   state.set('tool', 'select'); // triggers watcher
 *   state.set('tool', 'select'); // no-op, value unchanged
 *   unwatch();
 */
class State {
  /** @type {Object<string, *>} */
  #data = {};

  /** @type {Map<string, Set<Function>>} */
  #watchers = new Map();

  /**
   * Get the current value for a key.
   * @param {string} key
   * @returns {*} The stored value, or undefined if not set
   */
  get(key) {
    return this.#data[key];
  }

  /**
   * Set a value. If the value is unchanged (===), this is a no-op.
   * Otherwise, updates the value and notifies all watchers for that key.
   * @param {string} key
   * @param {*} value
   */
  set(key, value) {
    const oldValue = this.#data[key];
    if (oldValue === value) return;

    this.#data[key] = value;

    const set = this.#watchers.get(key);
    if (!set) return;

    for (const handler of set) {
      try {
        handler(value, oldValue);
      } catch (err) {
        console.error(`State [${key}]:`, err);
      }
    }
  }

  /**
   * Register a watcher for a specific key. The handler receives
   * (newValue, oldValue) whenever that key changes.
   * @param {string} key
   * @param {Function} handler - Called with (newValue, oldValue)
   * @returns {Function} Unwatch function — call it to remove this watcher
   */
  watch(key, handler) {
    if (!this.#watchers.has(key)) {
      this.#watchers.set(key, new Set());
    }
    this.#watchers.get(key).add(handler);

    return () => {
      const set = this.#watchers.get(key);
      if (!set) return;
      set.delete(handler);
      if (set.size === 0) {
        this.#watchers.delete(key);
      }
    };
  }

  /**
   * Returns a shallow copy of all stored data (for debugging).
   * @returns {Object<string, *>}
   */
  getAll() {
    return { ...this.#data };
  }

  /**
   * Clear all data and notify watchers with (undefined, oldValue)
   * for every key that had a value.
   */
  reset() {
    const keys = Object.keys(this.#data);
    for (const key of keys) {
      const oldValue = this.#data[key];
      delete this.#data[key];

      const set = this.#watchers.get(key);
      if (!set) continue;

      for (const handler of set) {
        try {
          handler(undefined, oldValue);
        } catch (err) {
          console.error(`State [${key}]:`, err);
        }
      }
    }
  }
}

export { State };
