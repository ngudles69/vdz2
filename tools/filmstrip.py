"""
Filmstrip converter — converts video to tiny thumbnail version for timeline.
Reads settings from tools/settings.json5.

Usage:
  python filmstrip.py input.mp4
  python filmstrip.py input.mp4 output.mp4

Requires: pip install imageio[ffmpeg] pyjson5
"""

import sys
import os
import subprocess
import time
import json
import imageio.plugins.ffmpeg

try:
    import pyjson5
except ImportError:
    pyjson5 = None

SETTINGS_PATH = os.path.join(os.path.dirname(__file__), 'settings.json5')

def load_settings():
    """Load settings from settings.json5, return defaults if missing."""
    defaults = {
        'width': 80,
        'fps': 30,
        'quality': 10,
        'audio': True,
        'suffix': '_filmstrip',
    }
    if not os.path.exists(SETTINGS_PATH):
        return defaults

    try:
        with open(SETTINGS_PATH, 'r') as f:
            raw = f.read()
        if pyjson5:
            data = pyjson5.loads(raw)
        else:
            # Fallback: strip // comments and parse as JSON
            import re
            stripped = re.sub(r'//.*', '', raw)
            stripped = re.sub(r',\s*([}\]])', r'\1', stripped)
            data = json.loads(stripped)
        fs = data.get('filmstrip', {})
        return {
            'width': fs.get('width', defaults['width']),
            'fps': fs.get('fps', defaults['fps']),
            'quality': fs.get('quality', defaults['quality']),
            'audio': fs.get('audio', defaults['audio']),
            'suffix': fs.get('suffix', defaults['suffix']),
        }
    except Exception as e:
        print(f"Warning: could not read settings.json5: {e}")
        return defaults

def get_ffmpeg_path():
    return imageio.plugins.ffmpeg.get_exe()

def get_ffprobe_path(ffmpeg):
    ffprobe = os.path.join(os.path.dirname(ffmpeg), 'ffprobe' + ('.exe' if os.name == 'nt' else ''))
    if os.path.exists(ffprobe):
        return ffprobe
    return ffmpeg.replace('ffmpeg', 'ffprobe')

def probe_video(ffprobe, path):
    """Get video info: resolution, fps, duration."""
    info = {'res': '?', 'fps': '?', 'dur': '?'}
    try:
        result = subprocess.run(
            [ffprobe, '-v', 'quiet', '-print_format', 'json', '-show_streams', '-show_format', path],
            capture_output=True, text=True,
        )
        if result.returncode != 0:
            return info
        data = json.loads(result.stdout)
        for s in data.get('streams', []):
            if s.get('codec_type') == 'video':
                info['res'] = f"{s.get('width', '?')}x{s.get('height', '?')}"
                r = s.get('r_frame_rate', '')
                if '/' in r:
                    num, den = r.split('/')
                    info['fps'] = f"{int(num)/int(den):.1f}"
                break
        dur = float(data.get('format', {}).get('duration', 0))
        if dur > 0:
            info['dur'] = f"{dur:.1f}s"
    except Exception:
        pass
    return info

def convert(input_path, output_path=None):
    settings = load_settings()

    if not os.path.exists(input_path):
        print(f"File not found: {input_path}")
        return

    if output_path is None:
        base, ext = os.path.splitext(input_path)
        output_path = f"{base}{settings['suffix']}{ext}"

    ffmpeg = get_ffmpeg_path()
    ffprobe = get_ffprobe_path(ffmpeg)

    # Build ffmpeg command from settings
    vf = f"scale={settings['width']}:-1,fps={settings['fps']}"
    cmd = [
        ffmpeg,
        '-i', input_path,
        '-vf', vf,
        '-q:v', str(settings['quality']),
    ]
    if not settings['audio']:
        cmd.append('-an')
    cmd += ['-y', output_path]

    print(f"Converting: {input_path}")
    print(f"Settings:   {settings['width']}px, {settings['fps']}fps, q={settings['quality']}, audio={'on' if settings['audio'] else 'off'}")

    # Source info
    src = probe_video(ffprobe, input_path)

    start = time.time()
    result = subprocess.run(cmd, capture_output=True, text=True)
    elapsed = time.time() - start

    if result.returncode != 0:
        print(f"Error: {result.stderr}")
        return

    # Output info
    out = probe_video(ffprobe, output_path)

    orig_size = os.path.getsize(input_path)
    new_size = os.path.getsize(output_path)
    print(f"Done in {elapsed:.1f}s")
    print(f"  Source:  {src['res']} @ {src['fps']}fps, {src['dur']}, {orig_size/1024:.0f}KB")
    print(f"  Output:  {out['res']} @ {out['fps']}fps, {new_size/1024:.0f}KB ({new_size/orig_size*100:.1f}%)")

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: python filmstrip.py input.mp4 [output.mp4]")
        sys.exit(1)

    convert(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None)
