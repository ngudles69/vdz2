/**
 * VideoZone — Manages the video zone at the bottom of the editor.
 *
 * Handles: video loading, transport controls, scrubber, bookmarks,
 * and the sections table. The video itself is a hidden <video> element;
 * the canvas displays it via THREE.VideoTexture (handled elsewhere).
 */
class VideoZone {

  #bus;
  #state;

  /** @type {HTMLVideoElement} */
  #video;

  /** @type {HTMLElement} */
  #zone;
  #emptyEl;
  #activeEl;
  #scrubber;
  #timeDisplay;
  #nameDisplay;
  #playBtn;
  #contentEl;

  /** @type {boolean} */
  #playing = false;

  /** @type {number} */
  #animFrame = 0;

  /** @type {number[]} Bookmark timestamps in seconds */
  #bookmarks = [];

  /** @type {string|null} Video filename */
  #videoName = null;

  constructor(bus, state) {
    this.#bus = bus;
    this.#state = state;

    // Create hidden video element
    this.#video = document.createElement('video');
    this.#video.preload = 'auto';
    this.#video.playsInline = true;
    this.#video.style.display = 'none';
    document.body.appendChild(this.#video);

    // DOM refs
    this.#zone = document.getElementById('video-zone');
    this.#emptyEl = document.getElementById('video-zone-empty');
    this.#activeEl = document.getElementById('video-zone-active');
    this.#scrubber = document.getElementById('vc-scrubber');
    this.#timeDisplay = document.getElementById('vc-time');
    this.#nameDisplay = document.getElementById('vc-name');
    this.#playBtn = document.getElementById('vc-play');
    this.#contentEl = document.getElementById('video-content');

    this.#wireLoadButton();
    this.#wireTransport();
    this.#wireScrubber();
    this.#wireBookmark();
  }

  // ---- Load / Unload ----

  #wireLoadButton() {
    document.getElementById('btn-load-video').addEventListener('click', () => {
      document.getElementById('video-upload').click();
    });

    document.getElementById('video-upload').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) this.loadVideo(file);
      e.target.value = '';
    });

    document.getElementById('vc-unload').addEventListener('click', () => {
      this.unloadVideo();
    });
  }

  loadVideo(file) {
    const url = URL.createObjectURL(file);
    this.#video.src = url;
    this.#videoName = file.name;

    this.#video.addEventListener('loadedmetadata', () => {
      this.#nameDisplay.textContent = file.name;
      this.#scrubber.max = Math.floor(this.#video.duration * 1000);
      this.#updateTime();
      this.#showActive();
      this.#bookmarks = [];
      this.#renderBookmarks();
      this.#bus.emit('video:loaded', {
        duration: this.#video.duration,
        width: this.#video.videoWidth,
        height: this.#video.videoHeight,
        name: file.name,
      });
    }, { once: true });
  }

  unloadVideo() {
    this.#video.pause();
    this.#video.src = '';
    this.#playing = false;
    cancelAnimationFrame(this.#animFrame);
    this.#bookmarks = [];
    this.#videoName = null;
    this.#showEmpty();
    this.#bus.emit('video:unloaded');
  }

  #showActive() {
    this.#emptyEl.style.display = 'none';
    this.#activeEl.style.display = 'flex';
    this.#zone.classList.remove('collapsed');
    this.#zone.classList.add('expanded');
  }

  #showEmpty() {
    this.#emptyEl.style.display = 'flex';
    this.#activeEl.style.display = 'none';
    this.#zone.classList.remove('expanded');
    this.#zone.classList.add('collapsed');
  }

  // ---- Transport ----

  #wireTransport() {
    document.getElementById('vc-start').addEventListener('click', () => this.#seek(0));
    document.getElementById('vc-end').addEventListener('click', () => this.#seek(this.#video.duration));
    document.getElementById('vc-back5').addEventListener('click', () => this.#seekRel(-5));
    document.getElementById('vc-fwd5').addEventListener('click', () => this.#seekRel(5));
    document.getElementById('vc-back1').addEventListener('click', () => this.#seekFrame(-1));
    document.getElementById('vc-fwd1').addEventListener('click', () => this.#seekFrame(1));
    document.getElementById('vc-play').addEventListener('click', () => this.#togglePlay());
    document.getElementById('vc-stop').addEventListener('click', () => this.#stop());
  }

  #togglePlay() {
    if (this.#playing) {
      this.#video.pause();
      this.#playing = false;
      cancelAnimationFrame(this.#animFrame);
      this.#playBtn.querySelector('.material-symbols-rounded').textContent = 'play_arrow';
    } else {
      this.#video.play();
      this.#playing = true;
      this.#playBtn.querySelector('.material-symbols-rounded').textContent = 'pause';
      this.#tick();
    }
  }

  #stop() {
    this.#video.pause();
    this.#video.currentTime = 0;
    this.#playing = false;
    cancelAnimationFrame(this.#animFrame);
    this.#playBtn.querySelector('.material-symbols-rounded').textContent = 'play_arrow';
    this.#updateTime();
  }

  #seek(time) {
    this.#video.currentTime = Math.max(0, Math.min(time, this.#video.duration || 0));
    this.#updateTime();
  }

  #seekRel(delta) {
    this.#seek(this.#video.currentTime + delta);
  }

  #seekFrame(frames) {
    // Approximate: 30fps = ~0.033s per frame
    this.#seek(this.#video.currentTime + frames * (1 / 30));
  }

  #tick() {
    if (!this.#playing) return;
    this.#updateTime();
    this.#animFrame = requestAnimationFrame(() => this.#tick());
  }

  // ---- Scrubber ----

  #wireScrubber() {
    let scrubbing = false;

    this.#scrubber.addEventListener('input', () => {
      scrubbing = true;
      const t = parseInt(this.#scrubber.value) / 1000;
      this.#video.currentTime = t;
      this.#updateTime();
    });

    this.#scrubber.addEventListener('change', () => {
      scrubbing = false;
    });

    // Update scrubber position during playback
    const origTick = this.#tick.bind(this);
    this.#tick = () => {
      if (!this.#playing) return;
      if (!scrubbing) {
        this.#scrubber.value = Math.floor(this.#video.currentTime * 1000);
      }
      this.#updateTime();
      this.#animFrame = requestAnimationFrame(() => this.#tick());
    };
  }

  // ---- Time display ----

  #updateTime() {
    const cur = this.#video.currentTime || 0;
    const dur = this.#video.duration || 0;
    this.#timeDisplay.textContent = `${this.#fmtTime(cur)} / ${this.#fmtTime(dur)}`;
    if (!this.#playing) {
      this.#scrubber.value = Math.floor(cur * 1000);
    }
    this.#bus.emit('video:timeupdate', { time: cur, duration: dur });
  }

  #fmtTime(s) {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, '0')}:${sec.toFixed(2).padStart(5, '0')}`;
  }

  // ---- Bookmarks ----

  #wireBookmark() {
    document.getElementById('vc-bookmark').addEventListener('click', () => {
      this.addBookmark();
    });
  }

  addBookmark() {
    if (!this.#video.src || !this.#video.duration) return;
    const time = this.#video.currentTime;

    // Don't add duplicate (within 0.1s)
    if (this.#bookmarks.some(b => Math.abs(b - time) < 0.1)) return;

    this.#bookmarks.push(time);
    this.#bookmarks.sort((a, b) => a - b);
    this.#renderBookmarks();
    this.#bus.emit('video:bookmark-added', { time, bookmarks: [...this.#bookmarks] });
  }

  removeBookmark(index) {
    this.#bookmarks.splice(index, 1);
    this.#renderBookmarks();
    this.#bus.emit('video:bookmark-removed', { bookmarks: [...this.#bookmarks] });
  }

  #renderBookmarks() {
    this.#contentEl.innerHTML = '';

    if (this.#bookmarks.length === 0) {
      this.#contentEl.innerHTML = '<div style="color:var(--vd-text-muted);font-size:11px;text-align:center;padding:4px;">Press <b>B</b> or bookmark button to mark sections</div>';
      return;
    }

    // Build sections from bookmarks
    const sections = this.#getSections();

    const table = document.createElement('div');
    table.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;align-items:center;';

    sections.forEach((sec, i) => {
      const tag = document.createElement('div');
      tag.style.cssText = `
        display: inline-flex;
        align-items: center;
        gap: 4px;
        background: var(--vd-surface-2);
        border: 1px solid var(--vd-border);
        border-radius: 4px;
        padding: 2px 8px;
        font-size: 11px;
        color: var(--vd-text-dim);
        cursor: pointer;
        font-family: Jost, sans-serif;
      `;

      const label = document.createElement('span');
      label.style.cssText = 'font-weight:600;color:var(--vd-text);min-width:14px;';
      label.textContent = `${i + 1}`;

      const time = document.createElement('span');
      time.textContent = `${this.#fmtTime(sec.start)} → ${this.#fmtTime(sec.end)}`;

      const removeBtn = document.createElement('span');
      removeBtn.style.cssText = 'cursor:pointer;color:var(--vd-text-muted);font-size:13px;margin-left:2px;';
      removeBtn.innerHTML = '×';
      removeBtn.title = 'Remove';
      // Remove the bookmark at the START of this section (which is bookmarks[i])
      removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        // The first section starts at 0 (or first bookmark), need to figure out which bookmark to remove
        if (i < this.#bookmarks.length) {
          this.removeBookmark(i);
        }
      });

      tag.addEventListener('click', () => this.#seek(sec.start));

      tag.appendChild(label);
      tag.appendChild(time);
      tag.appendChild(removeBtn);
      table.appendChild(tag);
    });

    this.#contentEl.appendChild(table);
  }

  /** Get sections from bookmarks. Each bookmark is a section boundary. */
  #getSections() {
    const dur = this.#video.duration || 0;
    const points = [0, ...this.#bookmarks, dur];
    const sections = [];
    for (let i = 0; i < points.length - 1; i++) {
      sections.push({ start: points[i], end: points[i + 1] });
    }
    return sections;
  }

  // ---- Public API ----

  /** @returns {HTMLVideoElement} */
  get videoElement() { return this.#video; }

  /** @returns {boolean} */
  get hasVideo() { return !!this.#video.src && this.#video.duration > 0; }

  /** @returns {number[]} */
  get bookmarks() { return [...this.#bookmarks]; }

  /** @returns {Array<{start: number, end: number}>} */
  get sections() { return this.#getSections(); }

  /** @returns {number} */
  get currentTime() { return this.#video.currentTime; }

  /** @returns {boolean} */
  get isPlaying() { return this.#playing; }
}

export { VideoZone };
