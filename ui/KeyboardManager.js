/**
 * KeyboardManager — Extensible keyboard shortcut registry.
 *
 * Shortcuts are registered dynamically, not hardcoded. Each shortcut
 * has a key combo, a description, a category, and an action callback.
 * Shortcuts can be added, removed, remapped, and listed at runtime.
 *
 * @example
 *   const kb = new KeyboardManager();
 *   kb.register({ key: 'Delete', action: () => deleteSelected(), label: 'Delete selected', category: 'edit' });
 *   kb.register({ key: 'Ctrl+A', action: () => selectAll(), label: 'Select all', category: 'edit' });
 *   kb.register({ key: 'S', action: () => togglePicker(), label: 'Toggle stitch picker', category: 'panels' });
 *
 *   // List all shortcuts (for help screen)
 *   kb.getAll(); // [{ key, label, category }, ...]
 *
 *   // Remap
 *   kb.remap('Delete selected', 'Backspace');
 */
class KeyboardManager {

  /**
   * @type {Array<{
   *   key: string,
   *   label: string,
   *   category: string,
   *   action: Function,
   *   when?: Function
   * }>}
   */
  #shortcuts = [];

  /** @type {boolean} Whether to suppress shortcuts (e.g. during text input) */
  #suppressed = false;

  constructor() {
    document.addEventListener('keydown', (e) => this.#onKeyDown(e));
  }

  /**
   * Register a keyboard shortcut.
   *
   * @param {object} opts
   * @param {string} opts.key - Key combo: 'Delete', 'Ctrl+A', 'Ctrl+Shift+Z', 'S', 'ArrowUp', etc.
   * @param {Function} opts.action - Callback to execute
   * @param {string} opts.label - Human-readable description
   * @param {string} [opts.category='general'] - Category for grouping in help screen
   * @param {Function} [opts.when] - Optional guard: shortcut only fires if when() returns true
   */
  register(opts) {
    this.#shortcuts.push({
      key: opts.key,
      label: opts.label,
      category: opts.category || 'general',
      action: opts.action,
      when: opts.when || null,
    });
  }

  /**
   * Remove a shortcut by label.
   * @param {string} label
   */
  unregister(label) {
    this.#shortcuts = this.#shortcuts.filter(s => s.label !== label);
  }

  /**
   * Remap a shortcut to a new key combo.
   * @param {string} label - The shortcut's label
   * @param {string} newKey - New key combo
   */
  remap(label, newKey) {
    const s = this.#shortcuts.find(s => s.label === label);
    if (s) s.key = newKey;
  }

  /**
   * Get all registered shortcuts (for help screen / UI).
   * @returns {Array<{ key: string, label: string, category: string }>}
   */
  getAll() {
    return this.#shortcuts.map(s => ({
      key: s.key,
      label: s.label,
      category: s.category,
    }));
  }

  /**
   * Get shortcuts grouped by category.
   * @returns {Object<string, Array<{ key: string, label: string }>>}
   */
  getGrouped() {
    const groups = {};
    for (const s of this.#shortcuts) {
      if (!groups[s.category]) groups[s.category] = [];
      groups[s.category].push({ key: s.key, label: s.label });
    }
    return groups;
  }

  /**
   * Temporarily suppress all shortcuts (e.g. during modal input).
   */
  suppress() { this.#suppressed = true; }

  /**
   * Resume shortcut handling.
   */
  resume() { this.#suppressed = false; }

  // ---- Internal ----

  #onKeyDown(e) {
    // Skip when typing in inputs
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
    if (this.#suppressed) return;

    const combo = this.#buildCombo(e);

    for (const shortcut of this.#shortcuts) {
      if (this.#matchCombo(shortcut.key, combo)) {
        // Check guard
        if (shortcut.when && !shortcut.when()) continue;

        e.preventDefault();
        shortcut.action();
        return; // first match wins
      }
    }
  }

  /**
   * Build a normalized combo string from a KeyboardEvent.
   * @param {KeyboardEvent} e
   * @returns {string} e.g. 'Ctrl+Shift+Z', 'Delete', 'S'
   */
  #buildCombo(e) {
    const parts = [];
    if (e.ctrlKey || e.metaKey) parts.push('Ctrl');
    if (e.shiftKey) parts.push('Shift');
    if (e.altKey) parts.push('Alt');

    // Normalize key name
    let key = e.key;
    if (key === ' ') key = 'Space';
    if (key.length === 1) key = key.toUpperCase();

    parts.push(key);
    return parts.join('+');
  }

  /**
   * Check if a registered key combo matches the event combo.
   * Normalizes both for comparison.
   * @param {string} registered - e.g. 'Ctrl+A', 'Delete'
   * @param {string} actual - from #buildCombo
   * @returns {boolean}
   */
  #matchCombo(registered, actual) {
    // Normalize registered combo
    const norm = registered
      .split('+')
      .map(p => p.trim())
      .map(p => p.length === 1 ? p.toUpperCase() : p)
      .sort()
      .join('+');

    const normActual = actual
      .split('+')
      .sort()
      .join('+');

    return norm === normActual;
  }
}

export { KeyboardManager };
