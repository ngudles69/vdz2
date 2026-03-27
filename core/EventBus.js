/**
 * Pub/sub message routing backbone.
 * Every module communicates exclusively through an EventBus instance.
 *
 * @example
 *   const bus = new EventBus();
 *   const unsub = bus.on('tool:changed', (data) => console.log(data));
 *   bus.emit('tool:changed', { tool: 'select' });
 *   unsub(); // removes handler
 */
class EventBus {
  /** @type {Map<string, Set<Function>>} */
  #handlers = new Map();

  /** When true, every emit() logs event name, data, and handler count. */
  debug = false;

  /**
   * Register a handler for an event.
   * @param {string} event - Event name (e.g. 'history:changed')
   * @param {Function} handler - Callback receiving the emitted data
   * @returns {Function} Unsubscribe function — call it to remove this handler
   */
  on(event, handler) {
    if (!this.#handlers.has(event)) {
      this.#handlers.set(event, new Set());
    }
    this.#handlers.get(event).add(handler);
    return () => this.off(event, handler);
  }

  /**
   * Remove a specific handler for an event. Safe no-op if event or handler
   * doesn't exist.
   * @param {string} event - Event name
   * @param {Function} handler - The exact handler reference to remove
   */
  off(event, handler) {
    const set = this.#handlers.get(event);
    if (!set) return;
    set.delete(handler);
    if (set.size === 0) {
      this.#handlers.delete(event);
    }
  }

  /**
   * Register a handler that fires exactly once, then auto-removes.
   * @param {string} event - Event name
   * @param {Function} handler - One-shot callback
   * @returns {Function} Unsubscribe function (can cancel before it fires)
   */
  once(event, handler) {
    const wrapper = (data) => {
      this.off(event, wrapper);
      handler(data);
    };
    return this.on(event, wrapper);
  }

  /**
   * Emit an event, delivering data to all registered handlers.
   * Each handler is called inside a try/catch so one broken handler
   * never prevents others from firing.
   * @param {string} event - Event name
   * @param {*} data - Payload passed to each handler
   */
  emit(event, data) {
    const set = this.#handlers.get(event);
    const count = set ? set.size : 0;

    if (this.debug) {
      console.debug(`[EventBus] ${event}`, data, `(${count} handlers)`);
    }

    if (!set) return;

    for (const handler of set) {
      try {
        handler(data);
      } catch (err) {
        console.error(`EventBus [${event}]:`, err);
      }
    }
  }

  /**
   * Check whether at least one handler is registered for an event.
   * @param {string} event - Event name
   * @returns {boolean}
   */
  has(event) {
    const set = this.#handlers.get(event);
    return set !== undefined && set.size > 0;
  }
}

export { EventBus };
