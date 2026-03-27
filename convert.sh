#!/usr/bin/env bash
# Convert a video to a tiny filmstrip version for the timeline.
# Scans the videos/ folder, lets user pick, converts in place.

VIDEOS_DIR="videos"

# Create folder if it doesn't exist
mkdir -p "$VIDEOS_DIR"

# Find videos, exclude _filmstrip files
files=()
while IFS= read -r f; do
  files+=("$f")
done < <(find "$VIDEOS_DIR" -maxdepth 1 -type f \( -iname "*.mp4" -o -iname "*.webm" -o -iname "*.mov" \) ! -iname "*_filmstrip.*" | sort)

if [ ${#files[@]} -eq 0 ]; then
  echo "No videos found in $VIDEOS_DIR/"
  echo "Place your .mp4, .webm, or .mov files there and run again."
  exit 1
fi

echo ""
echo "Videos in $VIDEOS_DIR/:"
echo "---"
for i in "${!files[@]}"; do
  size=$(du -h "${files[$i]}" | cut -f1)
  basename="${files[$i]##*/}"
  # Check if filmstrip already exists
  base="${basename%.*}"
  ext="${basename##*.}"
  filmstrip="$VIDEOS_DIR/${base}_filmstrip.${ext}"
  if [ -f "$filmstrip" ]; then
    fs_size=$(du -h "$filmstrip" | cut -f1)
    echo "  $((i+1)). $basename ($size) [filmstrip: $fs_size]"
  else
    echo "  $((i+1)). $basename ($size)"
  fi
done
echo "---"
echo ""

read -p "Choose video number to convert (or q to quit): " choice

if [ "$choice" = "q" ] || [ "$choice" = "Q" ]; then
  exit 0
fi

idx=$((choice - 1))
if [ $idx -lt 0 ] || [ $idx -ge ${#files[@]} ]; then
  echo "Invalid choice."
  exit 1
fi

input="${files[$idx]}"
echo ""
echo "Converting: $input"

source .venv/Scripts/activate 2>/dev/null || source .venv/bin/activate 2>/dev/null

python tools/filmstrip.py "$input"
