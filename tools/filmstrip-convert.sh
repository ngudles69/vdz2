#!/bin/bash
# Convert a video to a tiny filmstrip-friendly version
# Usage: ./filmstrip-convert.sh input.mp4 [output.mp4]
#
# Output: 80px wide, 1fps, no audio, low quality
# A 2h 1080x1920 video becomes ~120 frames, <100KB

INPUT="$1"
OUTPUT="${2:-${INPUT%.*}_filmstrip.mp4}"

if [ -z "$INPUT" ]; then
  echo "Usage: $0 input.mp4 [output.mp4]"
  exit 1
fi

ffmpeg -i "$INPUT" -vf "scale=80:-1,fps=1" -an -q:v 10 -y "$OUTPUT"

echo "Done: $OUTPUT"
