/**
 * SetBar — Bottom center bar with numbered set buttons.
 *
 * Wires click interactions (toggle visibility, double-click to select all)
 * and updates visual states (assigned dot, bold/dim/faint).
 */
class SetBar {

  #bus;
  #setManager;
  #selectionManager;
  #barEl;

  /** @type {Map<string, HTMLButtonElement>} data-set value → button element */
  #buttons = new Map();

  /** @type {number} Last click time for double-click detection */
  #lastClickTime = 0;
  #lastClickSet = null;

  /**
   * @param {object} bus
   * @param {object} setManager
   * @param {object} selectionManager
   */
  constructor(bus, setManager, selectionManager) {
    this.#bus = bus;
    this.#setManager = setManager;
    this.#selectionManager = selectionManager;
    this.#barEl = document.getElementById('set-bar');

    this.#wireButtons();
    this.#updateAll();

    // Update when sets change
    bus.on('set:changed', () => this.#updateAll());
    bus.on('stitch-store:added', () => this.#updateAll());
    bus.on('stitch-store:removed', () => this.#updateAll());
    bus.on('stitch-store:batch-updated', () => this.#updateAll());
  }

  #wireButtons() {
    const buttons = this.#barEl.querySelectorAll('.set-btn');
    for (const btn of buttons) {
      const setKey = btn.dataset.set;
      this.#buttons.set(setKey, btn);

      btn.addEventListener('click', () => {
        const now = performance.now();

        if (setKey === 'all') {
          if (this.#setManager.allVisible()) {
            this.#setManager.hideAll();
          } else {
            this.#setManager.showAll();
          }
          return;
        }

        if (setKey === 'more') {
          // Future: open set management panel
          return;
        }

        const setId = parseInt(setKey);

        // Double-click detection: select all stitches in this set
        if (this.#lastClickSet === setKey && (now - this.#lastClickTime) < 350) {
          const ids = this.#setManager.getStitchIds(setId);
          if (ids.length > 0) {
            this.#selectionManager.selectMultiple(ids);
          }
          this.#lastClickSet = null;
          this.#lastClickTime = 0;
          return;
        }

        // Single click: toggle visibility
        this.#setManager.toggleVisibility(setId);
        this.#lastClickSet = setKey;
        this.#lastClickTime = now;
      });
    }
  }

  #updateAll() {
    for (let i = 1; i <= 9; i++) {
      const btn = this.#buttons.get(String(i));
      if (!btn) continue;

      const hasStitches = this.#setManager.hasStitches(i);
      const isVisible = this.#setManager.isVisible(i);

      // Clear all states
      btn.classList.remove('assigned', 'visible', 'hidden');

      if (hasStitches) {
        btn.classList.add('assigned');
        btn.classList.add(isVisible ? 'visible' : 'hidden');
      }

      // Dot indicator — only for assigned groups
      let dot = btn.querySelector('.set-dot');
      if (hasStitches && !dot) {
        dot = document.createElement('span');
        dot.className = 'set-dot';
        btn.appendChild(dot);
      } else if (!hasStitches && dot) {
        dot.remove();
      }
      if (dot) {
        dot.classList.toggle('hidden-set', hasStitches && !isVisible);
      }
    }

    // ALL/HIDE button
    const allBtn = this.#buttons.get('all');
    if (allBtn) {
      const anyAssigned = this.#setManager.getAllSets().some(s => s.count > 0);
      if (!anyAssigned) {
        allBtn.textContent = 'ALL';
        allBtn.classList.remove('active');
        allBtn.disabled = true;
      } else {
        allBtn.disabled = false;
        const allVis = this.#setManager.allVisible();
        allBtn.textContent = allVis ? 'HIDE' : 'ALL';
        allBtn.classList.toggle('active', allVis);
      }
    }

    // MORE button: disabled if no groups assigned
    const moreBtn = this.#buttons.get('more');
    if (moreBtn) {
      const anyAssigned = this.#setManager.getAllSets().some(s => s.count > 0);
      moreBtn.disabled = !anyAssigned;
    }
  }
}

export { SetBar };
