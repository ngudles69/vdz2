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
  #playhead;
  #timeline;
  #timeDisplay;
  #nameDisplay;
  #playBtn;

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

    // Create hidden video element (no preview — filmstrip shows the content)
    this.#video = document.createElement('video');
    this.#video.preload = 'auto';
    this.#video.playsInline = true;
    this.#video.muted = true;
    this.#video.style.display = 'none';
    document.body.appendChild(this.#video);

    // DOM refs
    this.#zone = document.getElementById('video-zone');
    this.#emptyEl = document.getElementById('video-zone-empty');
    this.#activeEl = document.getElementById('video-zone-active');
    this.#playhead = document.getElementById('vc-playhead');
    this.#timeline = document.getElementById('video-filmstrip');
    this.#timeDisplay = document.getElementById('vc-time');
    this.#nameDisplay = document.getElementById('vc-name');
    this.#playBtn = document.getElementById('vc-play');

    this.#wireLoadButton();
    this.#wireTransport();
    this.#wireTimeline();
    this.#wireBookmark();
    this.#wireSpeed();
    this.#wireMinimize();
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
      // STEP 1: test playhead without filmstrip
      // this.#extractFilmstrip();
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
    this.#zone.classList.remove('collapsed', 'minimized');
    this.#zone.classList.add('expanded');
  }

  #showEmpty() {
    this.#activeEl.style.display = 'none';
    this.#zone.classList.remove('expanded', 'minimized');
    this.#zone.classList.add('collapsed');
    // Restore the load button
    this.#emptyEl.innerHTML = '';
    const loadBtn = document.createElement('button');
    loadBtn.innerHTML = '<span class="material-symbols-rounded" style="font-size:16px;vertical-align:middle;margin-right:4px;">movie</span> Load Video';
    loadBtn.addEventListener('click', () => document.getElementById('video-upload').click());
    // Match the original style
    loadBtn.style.cssText = 'background:var(--vd-surface-2);border:1px dashed var(--vd-border);border-radius:6px;color:var(--vd-text-dim);font-family:Jost,sans-serif;font-size:13px;padding:6px 18px;cursor:pointer;';
    this.#emptyEl.appendChild(loadBtn);
    this.#emptyEl.style.display = 'flex';
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

    // Auto-stop at end
    if (this.#video.ended) {
      this.#playing = false;
      this.#playBtn.querySelector('.material-symbols-rounded').textContent = 'play_arrow';
      this.#updateTime();
      return;
    }

    this.#updatePlayhead();
    this.#updateTime();
    this.#animFrame = requestAnimationFrame(() => this.#tick());
  }

  // ---- Timeline (click/drag to seek) ----

  #wireTimeline() {
    let dragging = false;

    const seekToX = (clientX) => {
      const rect = this.#timeline.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      this.#video.currentTime = pct * (this.#video.duration || 0);
      this.#updatePlayhead();
      this.#updateTime();
    };

    this.#timeline.addEventListener('pointerdown', (e) => {
      dragging = true;
      this.#timeline.setPointerCapture(e.pointerId);
      seekToX(e.clientX);
    });

    this.#timeline.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      seekToX(e.clientX);
    });

    this.#timeline.addEventListener('pointerup', () => {
      dragging = false;
    });
  }

  #updatePlayhead() {
    if (!this.#playhead || !this.#video.duration) return;
    const pct = (this.#video.currentTime / this.#video.duration) * 100;
    this.#playhead.style.left = `${pct}%`;
  }

  // ---- Time display ----

  #updateTime() {
    const cur = this.#video.currentTime || 0;
    const dur = this.#video.duration || 0;
    this.#timeDisplay.textContent = `${this.#fmtTime(cur)} / ${this.#fmtTime(dur)}`;
    this.#updatePlayhead();
    this.#bus.emit('video:timeupdate', { time: cur, duration: dur });
  }

  #fmtTime(s) {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, '0')}:${sec.toFixed(2).padStart(5, '0')}`;
  }

  // ---- Filmstrip ----

  async #extractFilmstrip() {
    const container = document.getElementById('video-filmstrip');
    if (!container) return;
    container.innerHTML = '';

    const dur = this.#video.duration;
    if (!dur || dur <= 0) return;

    // Calculate how many frames we need based on container width
    const containerWidth = container.clientWidth || 800;
    const frameHeight = 48;
    const aspect = this.#video.videoWidth / this.#video.videoHeight;
    const frameWidth = Math.round(frameHeight * aspect);
    const numFrames = Math.max(1, Math.ceil(containerWidth / frameWidth));

    // Create a single canvas for the filmstrip
    const canvas = document.createElement('canvas');
    canvas.width = containerWidth;
    canvas.height = frameHeight;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    container.appendChild(canvas);
    const ctx = canvas.getContext('2d');

    // Use a separate video element for extraction so we don't disrupt playback
    const extractor = document.createElement('video');
    extractor.src = this.#video.src;
    extractor.muted = true;
    extractor.preload = 'auto';

    await new Promise(resolve => {
      extractor.addEventListener('loadeddata', resolve, { once: true });
    });

    const vw = this.#video.videoWidth;
    const vh = this.#video.videoHeight;

    const drawFrame = (index) => {
      return new Promise(resolve => {
        const time = (index / numFrames) * dur;
        extractor.currentTime = time;

        extractor.addEventListener('seeked', () => {
          const dx = Math.round((index / numFrames) * containerWidth);
          const dw = Math.round(((index + 1) / numFrames) * containerWidth) - dx;

          // "Cover" crop: fill the slot completely, cropping excess
          const slotAspect = dw / frameHeight;
          const videoAspect = vw / vh;

          let sx, sy, sw, sh;
          if (videoAspect > slotAspect) {
            // Video wider than slot — crop sides
            sh = vh;
            sw = sh * slotAspect;
            sx = (vw - sw) / 2;
            sy = 0;
          } else {
            // Video taller than slot — crop top/bottom
            sw = vw;
            sh = sw / slotAspect;
            sx = 0;
            sy = (vh - sh) / 2;
          }

          ctx.drawImage(extractor, sx, sy, sw, sh, dx, 0, dw, frameHeight);
          resolve();
        }, { once: true });
      });
    };

    // Extract frames sequentially
    for (let i = 0; i < numFrames; i++) {
      await drawFrame(i);
    }

    // Clean up extractor
    extractor.src = '';
  }

  // ---- Minimize / Expand ----

  #wireMinimize() {
    const minBtn = document.getElementById('vc-minimize');
    minBtn.addEventListener('click', () => this.toggleMinimize());

    // Also allow clicking the empty area to expand when minimized
    this.#emptyEl.parentElement.addEventListener('click', (e) => {
      if (this.#zone.classList.contains('minimized') && e.target === this.#zone) {
        this.toggleMinimize();
      }
    });
  }

  toggleMinimize() {
    if (!this.hasVideo) return;
    const isMinimized = this.#zone.classList.contains('minimized');
    if (isMinimized) {
      this.#zone.classList.remove('minimized');
      this.#zone.classList.add('expanded');
      this.#activeEl.style.display = 'flex';
      document.getElementById('vc-minimize').querySelector('.material-symbols-rounded').textContent = 'expand_more';
    } else {
      this.#zone.classList.remove('expanded');
      this.#zone.classList.add('minimized');
      this.#activeEl.style.display = 'none';
      // Show a minimal bar with expand button
      this.#emptyEl.style.display = 'flex';
      this.#emptyEl.innerHTML = '';
      const expandBtn = document.createElement('button');
      expandBtn.style.cssText = 'background:none;border:none;color:var(--vd-text-dim);cursor:pointer;font-family:Jost,sans-serif;font-size:12px;display:flex;align-items:center;gap:4px;';
      expandBtn.innerHTML = `<span class="material-symbols-rounded" style="font-size:16px;">expand_less</span> ${this.#videoName || 'Video'}`;
      expandBtn.addEventListener('click', () => this.toggleMinimize());
      this.#emptyEl.appendChild(expandBtn);
    }
  }

  // ---- Playback speed ----

  static SPEED_STOPS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2];

  #wireSpeed() {
    const slider = document.getElementById('vc-speed');
    const label = document.getElementById('vc-speed-label');

    slider.addEventListener('input', () => {
      const idx = parseInt(slider.value);
      const speed = VideoZone.SPEED_STOPS[idx] || 1;
      this.#video.playbackRate = speed;
      label.textContent = speed === 1 ? '1x' : `${speed}x`;
    });
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

  #renderScrubberMarkers() {
    const container = document.getElementById('scrubber-markers');
    if (!container) return;
    container.innerHTML = '';

    const dur = this.#video.duration || 0;
    if (dur <= 0) return;

    this.#bookmarks.forEach((time, i) => {
      const pct = (time / dur) * 100;
      const marker = document.createElement('div');
      marker.className = 'scrubber-marker';
      marker.style.left = `${pct}%`;

      const label = document.createElement('div');
      label.className = 'scrubber-marker-label';
      label.textContent = `${i + 1}`;
      marker.appendChild(label);

      container.appendChild(marker);
    });
  }

  #renderBookmarks() {
    this.#renderScrubberMarkers();

    // Update hint text
    const hint = document.getElementById('vc-hint');
    if (hint) {
      hint.textContent = this.#bookmarks.length > 0
        ? `(${this.#bookmarks.length} bookmark${this.#bookmarks.length > 1 ? 's' : ''})`
        : '(press B to bookmark)';
    }
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
