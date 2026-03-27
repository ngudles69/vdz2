"""
Filmstrip converter — converts video to tiny thumbnail version for timeline.
Output: 80px wide, 1fps, no audio, low quality.

Usage:
  python filmstrip.py input.mp4
  python filmstrip.py input.mp4 output.mp4

Requires: pip install imageio[ffmpeg]
(ffmpeg binary auto-downloads on first run)
"""

import sys
import os
import subprocess
import time
import imageio.plugins.ffmpeg

def get_ffmpeg_path():
    """Get the ffmpeg binary path from imageio."""
    return imageio.plugins.ffmpeg.get_exe()

def convert(input_path, output_path=None):
    if not os.path.exists(input_path):
        print(f"File not found: {input_path}")
        return

    if output_path is None:
        base, ext = os.path.splitext(input_path)
        output_path = f"{base}_filmstrip{ext}"

    ffmpeg = get_ffmpeg_path()
    cmd = [
        ffmpeg,
        '-i', input_path,
        '-vf', 'scale=80:-1,fps=1',
        '-an',
        '-q:v', '10',
        '-y',
        output_path,
    ]

    print(f"Converting: {input_path}")
    print(f"Output:     {output_path}")

    start = time.time()
    result = subprocess.run(cmd, capture_output=True, text=True)
    elapsed = time.time() - start

    if result.returncode != 0:
        print(f"Error: {result.stderr}")
        return

    orig_size = os.path.getsize(input_path)
    new_size = os.path.getsize(output_path)
    print(f"Done in {elapsed:.1f}s: {orig_size/1024:.0f}KB → {new_size/1024:.0f}KB ({new_size/orig_size*100:.1f}%)")

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: python filmstrip.py input.mp4 [output.mp4]")
        sys.exit(1)

    convert(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None)
