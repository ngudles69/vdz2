// ---------------------------------------------------------------------------
// Toast — lightweight notification system
// ---------------------------------------------------------------------------

let toastEl = null;
let timer = null;

/**
 * Show a temporary toast message.
 * @param {string} message - Text to display
 * @param {number} [duration=2000] - Duration in ms before fading
 */
export function toast(message, duration = 2000) {
  if (!toastEl) {
    toastEl = document.getElementById('toast');
  }
  if (!toastEl) return;

  // Clear any pending hide
  if (timer) clearTimeout(timer);

  toastEl.textContent = message;
  toastEl.classList.add('show');

  timer = setTimeout(() => {
    toastEl.classList.remove('show');
    timer = null;
  }, duration);
}
