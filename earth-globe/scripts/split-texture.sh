#!/bin/bash
# Split a large texture into tiles using macOS 'sips' (no ImageMagick needed).
#
# Usage:  ./split-texture.sh <input.jpg> <cols> <rows> <outputDir>
# Example: ./split-texture.sh ../public/textures/earth-day-16k.jpg 4 2 ../public/textures/tiles/earth-day-16k
#
# The script creates tiles named col0_row0.jpg, col1_row0.jpg, etc.
# It also generates a manifest.json with tile metadata.

set -e

INPUT="$1"
COLS="${2:-4}"
ROWS="${3:-2}"
OUTDIR="${4:-tiles}"

if [ ! -f "$INPUT" ]; then
  echo "❌ Input file not found: $INPUT"
  exit 1
fi

# Get image dimensions
WIDTH=$(sips -g pixelWidth "$INPUT" | tail -1 | awk '{print $2}')
HEIGHT=$(sips -g pixelHeight "$INPUT" | tail -1 | awk '{print $2}')
TILE_W=$((WIDTH / COLS))
TILE_H=$((HEIGHT / ROWS))

echo "📐 Input: ${WIDTH}×${HEIGHT}"
echo "🔲 Tiles: ${COLS}×${ROWS} = $((COLS * ROWS)) tiles of ${TILE_W}×${TILE_H}"
echo "📁 Output: $OUTDIR"

mkdir -p "$OUTDIR"

for ((row=0; row<ROWS; row++)); do
  for ((col=0; col<COLS; col++)); do
    OFFSET_X=$((col * TILE_W))
    OFFSET_Y=$((row * TILE_H))
    OUTFILE="$OUTDIR/col${col}_row${row}.jpg"

    if [ -f "$OUTFILE" ]; then
      echo "  ✅ col${col}_row${row}.jpg already exists"
      continue
    fi

    echo "  ✂️  col${col}_row${row}.jpg (offset ${OFFSET_X},${OFFSET_Y})"

    # sips crop: --cropToHeightWidth <height> <width> crops from top-left,
    # so we need a 2-step approach: crop-offset then crop-size
    # Step 1: Create a temp file cropped from the right offset
    TMPFILE="$OUTDIR/.tmp_tile.jpg"
    cp "$INPUT" "$TMPFILE"

    # Pad calculation for cropOffset
    # sips --cropOffset requires: --cropOffset <y> <x> <height> <width>
    sips --cropOffset "$OFFSET_Y" "$OFFSET_X" --cropToHeightWidth "$TILE_H" "$TILE_W" "$TMPFILE" --out "$OUTFILE" > /dev/null 2>&1

    rm -f "$TMPFILE"
  done
done

# Generate manifest.json
cat > "$OUTDIR/manifest.json" << EOF
{
  "width": $WIDTH,
  "height": $HEIGHT,
  "cols": $COLS,
  "rows": $ROWS,
  "tileWidth": $TILE_W,
  "tileHeight": $TILE_H,
  "tiles": [
$(for ((row=0; row<ROWS; row++)); do
  for ((col=0; col<COLS; col++)); do
    COMMA=""
    if [ $row -lt $((ROWS-1)) ] || [ $col -lt $((COLS-1)) ]; then COMMA=","; fi
    echo "    { \"col\": $col, \"row\": $row, \"file\": \"col${col}_row${row}.jpg\" }$COMMA"
  done
done)
  ]
}
EOF

echo ""
echo "🎉 Done! Generated $((COLS * ROWS)) tiles + manifest.json"
echo "   Total output size: $(du -sh "$OUTDIR" | cut -f1)"
