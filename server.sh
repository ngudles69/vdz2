#!/usr/bin/env bash
# Start a local dev server for the freeform editor.
# Usage: bash serve.sh [port]
# Then open http://localhost:<port>/vdzffedit.html

PORT="${1:-3688}"
echo "Serving on http://localhost:$PORT/vdzffedit.html"
uv run python -m http.server "$PORT" --bind 0.0.0.0
