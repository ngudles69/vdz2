/**
 * ClipEncoder — Orchestrates clip generation pipeline.
 *
 * Renders each frame via ClipRenderer, encodes via WebCodecs + webm-muxer
 * (or falls back to PNG sequence export).
 *
 * Supports:
 *   - WebM (VP9 + alpha) — transparent overlay
 *   - PNG sequence + meta.json — universal fallback
 *   - MP4 green screen — solid green background for chroma key
 */

class ClipEncoder {

  /** @type {import('./ClipRenderer.js').ClipRenderer} */
  #clipRenderer;

  /** @type {import('./RecipeInterpreter.js').RecipeInterpreter} */
  #interpreter;

  /** @type {boolean} */
  #cancelled = false;

  /** @type {string} 'webm' | 'png' | 'greenscreen' */
  #format;

  /**
   * @param {import('./ClipRenderer.js').ClipRenderer} clipRenderer
   * @param {import('./RecipeInterpreter.js').RecipeInterpreter} interpreter
   * @param {{ format: string }} options
   */
  constructor(clipRenderer, interpreter, options = {}) {
    this.#clipRenderer = clipRenderer;
    this.#interpreter = interpreter;
    this.#format = options.format || 'webm';
  }

  /**
   * Check if WebCodecs + VideoEncoder is available.
   * @returns {boolean}
   */
  static isWebCodecsSupported() {
    return typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined';
  }

  /**
   * Generate the clip.
   * @param {function} onProgress - Called with { currentFrame, totalFrames, percent }
   * @returns {Promise<{ blob: Blob, filename: string }|{ blobs: Blob[], meta: object, filename: string }>}
   */
  async generate(onProgress) {
    this.#cancelled = false;
    const totalFrames = this.#interpreter.getTotalFrames();

    if (totalFrames === 0) {
      throw new Error('No frames to render — check that the clip recipe has effects assigned.');
    }

    if (this.#format === 'png') {
      return this.#generatePNG(totalFrames, onProgress);
    } else if (this.#format === 'greenscreen') {
      return this.#generateGreenScreen(totalFrames, onProgress);
    } else {
      return this.#generateWebM(totalFrames, onProgress);
    }
  }

  /** Cancel in-progress generation */
  cancel() {
    this.#cancelled = true;
  }

  // ================================================================
  // WebM (VP9 + alpha)
  // ================================================================

  async #generateWebM(totalFrames, onProgress) {
    const { Muxer, ArrayBufferTarget } = await import('webm-muxer');

    const width = this.#clipRenderer.width;
    const height = this.#clipRenderer.height;
    const fps = this.#interpreter.getFps();

    // Check if VP9 with alpha is supported
    let codec = 'vp09.00.10.08';
    let useAlpha = true;
    const alphaConfig = {
      codec,
      width,
      height,
      bitrate: 4_000_000,
      framerate: fps,
      alpha: 'keep',
    };

    const support = await VideoEncoder.isConfigSupported(alphaConfig);
    if (!support.supported) {
      // Fall back to VP8
      codec = 'vp8';
      useAlpha = false;
      console.warn('VP9 alpha not supported, falling back to VP8 (no alpha)');
    }

    const target = new ArrayBufferTarget();
    const muxer = new Muxer({
      target,
      video: {
        codec: 'V_VP9',
        width,
        height,
        frameRate: fps,
        alpha: useAlpha,
      },
    });

    let encoderError = null;
    const encoder = new VideoEncoder({
      output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
      error: (e) => { encoderError = e; },
    });

    const config = support.supported ? support.config : {
      codec,
      width,
      height,
      bitrate: 4_000_000,
      framerate: fps,
    };
    encoder.configure(config);

    for (let i = 0; i < totalFrames; i++) {
      if (this.#cancelled) {
        encoder.close();
        throw new Error('Generation cancelled');
      }
      if (encoderError) {
        encoder.close();
        throw encoderError;
      }

      const frameState = this.#interpreter.getFrameState(i);
      const canvas = this.#clipRenderer.renderFrame(frameState);

      const frame = new VideoFrame(canvas, {
        timestamp: (i / fps) * 1_000_000, // microseconds
        duration: (1 / fps) * 1_000_000,
      });

      encoder.encode(frame, { keyFrame: i % (fps * 2) === 0 });
      frame.close();

      if (onProgress) {
        onProgress({ currentFrame: i + 1, totalFrames, percent: Math.round(((i + 1) / totalFrames) * 100) });
      }

      // Yield to UI thread periodically
      if (i % 10 === 0) await new Promise(r => setTimeout(r, 0));
    }

    if (encoderError) throw encoderError;

    await encoder.flush();
    encoder.close();
    muxer.finalize();

    const blob = new Blob([target.buffer], { type: 'video/webm' });
    return { blob, filename: 'clip-overlay.webm' };
  }

  // ================================================================
  // Green Screen MP4 (via WebM with solid background)
  // ================================================================

  async #generateGreenScreen(totalFrames, onProgress) {
    const { Muxer, ArrayBufferTarget } = await import('mp4-muxer');

    const width = this.#clipRenderer.width;
    const height = this.#clipRenderer.height;
    const fps = this.#interpreter.getFps();

    // H.264 for MP4
    const codec = 'avc1.640028'; // H.264 High Profile Level 4.0
    const testConfig = { codec, width, height, bitrate: 4_000_000, framerate: fps };
    const support = await VideoEncoder.isConfigSupported(testConfig);
    if (!support.supported) {
      throw new Error('H.264 encoding not supported on this browser.');
    }

    const target = new ArrayBufferTarget();
    const muxer = new Muxer({
      target,
      video: {
        codec: 'avc',
        width,
        height,
      },
      fastStart: 'in-memory',
    });

    let encoderError = null;
    const encoder = new VideoEncoder({
      output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
      error: (e) => { encoderError = e; },
    });

    encoder.configure(support.config);

    for (let i = 0; i < totalFrames; i++) {
      if (this.#cancelled) {
        encoder.close();
        throw new Error('Generation cancelled');
      }
      if (encoderError) {
        encoder.close();
        throw encoderError;
      }

      const frameState = this.#interpreter.getFrameState(i);
      const canvas = this.#clipRenderer.renderFrameGreenScreen(frameState);

      const frame = new VideoFrame(canvas, {
        timestamp: (i / fps) * 1_000_000,
        duration: (1 / fps) * 1_000_000,
      });

      encoder.encode(frame, { keyFrame: i % (fps * 2) === 0 });
      frame.close();

      if (onProgress) {
        onProgress({ currentFrame: i + 1, totalFrames, percent: Math.round(((i + 1) / totalFrames) * 100) });
      }

      if (i % 10 === 0) await new Promise(r => setTimeout(r, 0));
    }

    if (encoderError) throw encoderError;

    await encoder.flush();
    encoder.close();
    muxer.finalize();

    const blob = new Blob([target.buffer], { type: 'video/mp4' });
    return { blob, filename: 'clip-greenscreen.mp4' };
  }

  // ================================================================
  // PNG Sequence
  // ================================================================

  async #generatePNG(totalFrames, onProgress) {
    const fps = this.#interpreter.getFps();
    const blobs = [];

    for (let i = 0; i < totalFrames; i++) {
      if (this.#cancelled) {
        throw new Error('Generation cancelled');
      }

      const frameState = this.#interpreter.getFrameState(i);
      const canvas = this.#clipRenderer.renderFrame(frameState);

      const blob = await new Promise(resolve => {
        canvas.toBlob(resolve, 'image/png');
      });
      blobs.push(blob);

      if (onProgress) {
        onProgress({ currentFrame: i + 1, totalFrames, percent: Math.round(((i + 1) / totalFrames) * 100) });
      }

      // Yield to UI
      if (i % 5 === 0) await new Promise(r => setTimeout(r, 0));
    }

    // Build meta.json
    const sections = [];
    let frameOffset = 0;
    const interpreter = this.#interpreter;
    // We'll just store basic info
    const meta = {
      fps,
      frameCount: totalFrames,
      duration: interpreter.getDuration(),
      resolution: {
        width: this.#clipRenderer.width,
        height: this.#clipRenderer.height,
      },
      ffmpegCommand: `ffmpeg -framerate ${fps} -i %03d.png -c:v libvpx-vp9 -pix_fmt yuva420p output.webm`,
    };

    const metaBlob = new Blob([JSON.stringify(meta, null, 2)], { type: 'application/json' });

    return { blobs, meta, metaBlob, filename: 'clip-frames' };
  }
}

export { ClipEncoder };
