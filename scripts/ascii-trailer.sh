#!/usr/bin/env bash
# scripts/ascii-trailer.sh — turn a screen recording of HermesWorld into ASCII frames
# for a Discord/Twitter teaser. Uses ffmpeg + Python (PIL+ascii) since chafa isn't
# installed. Output: ascii-trailer/ with per-frame .txt + a single combined .gif.
#
# Usage:
#   ./scripts/ascii-trailer.sh ~/Movies/hermesworld-demo.mov
set -euo pipefail
INPUT="${1:-}"
if [[ -z "$INPUT" || ! -f "$INPUT" ]]; then
  echo "Usage: $0 <video-file>"
  echo "Example: $0 ~/Movies/hermesworld-demo.mov"
  exit 1
fi

OUT_DIR="ascii-trailer"
FRAMES_DIR="$OUT_DIR/frames"
ASCII_DIR="$OUT_DIR/ascii"
mkdir -p "$FRAMES_DIR" "$ASCII_DIR"

echo "→ Extracting 1 frame/sec from $INPUT..."
ffmpeg -y -loglevel error -i "$INPUT" -vf "fps=1,scale=120:-1" "$FRAMES_DIR/frame-%04d.png"

echo "→ Converting frames to ASCII..."
python3 <<'PY'
import os
from glob import glob
try:
    from PIL import Image
except ImportError:
    print("ERR: pip install Pillow --break-system-packages")
    raise SystemExit(1)

CHARS = " .:-=+*#%@"
def to_ascii(img_path: str, width: int = 100) -> str:
    img = Image.open(img_path).convert("L")
    w, h = img.size
    aspect = h / w / 2  # font is ~2x taller than wide
    new_w = width
    new_h = int(width * aspect)
    img = img.resize((new_w, new_h))
    px = img.load()
    out = []
    for y in range(new_h):
        line = []
        for x in range(new_w):
            v = px[x, y]
            line.append(CHARS[v * (len(CHARS) - 1) // 255])
        out.append("".join(line))
    return "\n".join(out)

for f in sorted(glob("ascii-trailer/frames/*.png")):
    name = os.path.basename(f).replace(".png", ".txt")
    open(f"ascii-trailer/ascii/{name}", "w").write(to_ascii(f))

print(f"→ Wrote {len(glob('ascii-trailer/ascii/*.txt'))} ASCII frames to ascii-trailer/ascii/")
PY

# Build a single combined "carousel" markdown
echo "→ Building combined ascii-trailer.md..."
{
  echo "# HermesWorld — ASCII Trailer"
  echo ""
  for f in "$ASCII_DIR"/*.txt; do
    echo "## Frame $(basename "$f" .txt)"
    echo ""
    echo '```'
    cat "$f"
    echo ""
    echo '```'
    echo ""
  done
} > "$OUT_DIR/ascii-trailer.md"

echo "✓ Done. ASCII frames in $ASCII_DIR/, combined md in $OUT_DIR/ascii-trailer.md"
echo ""
echo "Tip: paste the first frame into Discord in a code block for instant teaser."
