#!/bin/bash
# Download high-resolution NASA textures for the Earth globe project.
# Sources: NASA Visible Earth / Blue Marble / Black Marble (public domain)

set -e
TEXTURE_DIR="$(cd "$(dirname "$0")/../public/textures" && pwd)"
echo "📁 Texture directory: $TEXTURE_DIR"

# ─── 8K Night Lights (NASA Black Marble 2016, 13500×6750) ────────────────────
NIGHT_8K="$TEXTURE_DIR/earth-night-8k.jpg"
NIGHT_URL="https://assets.science.nasa.gov/content/dam/science/esd/eo/images/imagerecords/144000/144898/BlackMarble_2016_3km.jpg"

if [ -f "$NIGHT_8K" ]; then
  echo "✅ earth-night-8k.jpg already exists ($(du -h "$NIGHT_8K" | cut -f1))"
else
  echo "⬇️  Downloading 8K night lights texture..."
  curl -L --progress-bar -o "$NIGHT_8K" "$NIGHT_URL"
  echo "✅ Downloaded earth-night-8k.jpg ($(du -h "$NIGHT_8K" | cut -f1))"
fi

# ─── 16K Day Texture (NASA Blue Marble Next Gen, 21600×10800) ────────────────
DAY_16K="$TEXTURE_DIR/earth-day-16k.jpg"
DAY_URL="https://eoimages.gsfc.nasa.gov/images/imagerecords/73000/73580/world.topo.bathy.200401.3x21600x10800.jpg"

if [ -f "$DAY_16K" ]; then
  echo "✅ earth-day-16k.jpg already exists ($(du -h "$DAY_16K" | cut -f1))"
else
  echo "⬇️  Downloading 16K day texture (this may take a while, ~50MB)..."
  curl -L --progress-bar -o "$DAY_16K" "$DAY_URL"
  echo "✅ Downloaded earth-day-16k.jpg ($(du -h "$DAY_16K" | cut -f1))"
fi

echo ""
echo "🎉 All textures downloaded!"
echo "   Night 8K: $(du -h "$NIGHT_8K" | cut -f1)"
echo "   Day 16K:  $(du -h "$DAY_16K" | cut -f1)"
