#!/bin/bash
# ============================================================
# Asset Integrity Checker
# Scans source code for referenced assets and verifies
# they are tracked by git. Run before committing/pushing.
# ============================================================

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_ROOT"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color
BOLD='\033[1m'

echo ""
echo "${BOLD}🔍 Asset Integrity Check${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

MISSING=0
WARNED=0
CHECKED=0

# -----------------------------------------------------------
# 1. Check texture files referenced in JS/HTML/CSS
# -----------------------------------------------------------
echo ""
echo "${BOLD}📦 Checking texture references...${NC}"

# Extract all /textures/...file paths from source code (exclude node_modules, dist, test files)
TEXTURE_REFS=$(grep -rhoE "'/textures/[^']+'" \
  --include='*.js' --include='*.html' --include='*.css' \
  --exclude-dir='node_modules' --exclude-dir='dist' . \
  | sed "s/'//g" \
  | sort -u \
  | grep -v 'placeholder' \
  | grep -v '/tiles/' \
  | grep -v '\.test\.' \
  || true)

for ref in $TEXTURE_REFS; do
  filepath="public${ref}"
  CHECKED=$((CHECKED + 1))

  if [ ! -f "$filepath" ]; then
    echo "  ${RED}✗ MISSING FILE:${NC} $filepath (referenced in code)"
    MISSING=$((MISSING + 1))
  elif ! git ls-files --error-unmatch "$filepath" > /dev/null 2>&1; then
    # File exists locally but is not tracked by git
    if git check-ignore -q "$filepath" 2>/dev/null; then
      echo "  ${YELLOW}⚠ GITIGNORED:${NC} $filepath (exists locally but excluded by .gitignore)"
      WARNED=$((WARNED + 1))
    else
      echo "  ${RED}✗ UNTRACKED:${NC} $filepath (exists but not added to git)"
      MISSING=$((MISSING + 1))
    fi
  else
    echo "  ${GREEN}✓${NC} $filepath"
  fi
done

# -----------------------------------------------------------
# 2. Check shader imports
# -----------------------------------------------------------
echo ""
echo "${BOLD}🎨 Checking shader references...${NC}"

SHADER_REFS=$(grep -rhoE "from './shaders/[^']+\.(vert|frag|glsl)'" \
  --include='*.js' \
  --exclude-dir='node_modules' --exclude-dir='dist' . \
  | sed "s/from '//;s/'//" \
  | sed 's|^\./||' \
  | sort -u \
  || true)

for ref in $SHADER_REFS; do
  CHECKED=$((CHECKED + 1))
  if [ ! -f "$ref" ]; then
    echo "  ${RED}✗ MISSING FILE:${NC} $ref"
    MISSING=$((MISSING + 1))
  elif ! git ls-files --error-unmatch "$ref" > /dev/null 2>&1; then
    echo "  ${RED}✗ UNTRACKED:${NC} $ref"
    MISSING=$((MISSING + 1))
  else
    echo "  ${GREEN}✓${NC} $ref"
  fi
done

# -----------------------------------------------------------
# 3. Check tile manifest and tile files
# -----------------------------------------------------------
echo ""
echo "${BOLD}🗺️  Checking tile assets...${NC}"

for manifest in $(find public/textures/tiles -name 'manifest.json' 2>/dev/null); do
  CHECKED=$((CHECKED + 1))
  tiledir=$(dirname "$manifest")
  cols=$(python3 -c "import json; print(json.load(open('$manifest'))['cols'])" 2>/dev/null || echo "0")
  rows=$(python3 -c "import json; print(json.load(open('$manifest'))['rows'])" 2>/dev/null || echo "0")

  if [ "$cols" -eq 0 ] || [ "$rows" -eq 0 ]; then
    echo "  ${YELLOW}⚠ Cannot parse:${NC} $manifest"
    WARNED=$((WARNED + 1))
    continue
  fi

  echo "  Manifest: $manifest (${cols}x${rows} grid)"
  for ((c=0; c<cols; c++)); do
    for ((r=0; r<rows; r++)); do
      tile="$tiledir/col${c}_row${r}.jpg"
      CHECKED=$((CHECKED + 1))
      if [ ! -f "$tile" ]; then
        echo "    ${RED}✗ MISSING:${NC} $tile"
        MISSING=$((MISSING + 1))
      elif ! git ls-files --error-unmatch "$tile" > /dev/null 2>&1; then
        echo "    ${RED}✗ UNTRACKED:${NC} $tile"
        MISSING=$((MISSING + 1))
      else
        echo "    ${GREEN}✓${NC} $tile"
      fi
    done
  done
done

# -----------------------------------------------------------
# 4. Check for large untracked files that might be forgotten
# -----------------------------------------------------------
echo ""
echo "${BOLD}📊 Scanning for untracked media files...${NC}"

UNTRACKED_MEDIA=$(git ls-files --others --exclude-standard \
  | grep -iE '\.(jpg|jpeg|png|gif|svg|webp|hdr|obj|gltf|glb|mp4|webm)$' \
  || true)

if [ -n "$UNTRACKED_MEDIA" ]; then
  echo "$UNTRACKED_MEDIA" | while read -r f; do
    size=$(du -sh "$f" 2>/dev/null | cut -f1)
    echo "  ${YELLOW}⚠ UNTRACKED:${NC} $f ($size)"
    WARNED=$((WARNED + 1))
  done
else
  echo "  ${GREEN}✓ No untracked media files found${NC}"
fi

# -----------------------------------------------------------
# Summary
# -----------------------------------------------------------
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "${BOLD}Summary:${NC} $CHECKED items checked"

if [ "$MISSING" -gt 0 ]; then
  echo "${RED}  ✗ $MISSING missing or untracked resources${NC}"
  echo ""
  echo "${RED}${BOLD}❌ CHECK FAILED${NC} — fix the issues above before pushing."
  exit 1
elif [ "$WARNED" -gt 0 ]; then
  echo "${YELLOW}  ⚠ $WARNED warnings (review recommended)${NC}"
  echo ""
  echo "${YELLOW}${BOLD}⚠️  CHECK PASSED WITH WARNINGS${NC}"
  exit 0
else
  echo "${GREEN}  ✓ All resources are tracked and present${NC}"
  echo ""
  echo "${GREEN}${BOLD}✅ CHECK PASSED${NC}"
  exit 0
fi
