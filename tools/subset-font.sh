#!/usr/bin/env bash
# Subset JetBrains Mono to the glyphs this profile actually uses, then base64 it
# for inline @font-face embedding.
#
# An SVG loaded via <img> cannot fetch external resources, so a webfont only
# arrives if it is embedded as a data: URI. The full TTF is 270KB; the subset is
# under 5KB.
#
# Regular weight only. The brand takes emphasis from colour, not weight
# (max weight 500, "no 700+ bold anywhere"), so a second face would be dead bytes.
#
# Requires uv (https://docs.astral.sh/uv/). The user-level pyftsubset at
# ~/Library/Python/3.13/bin has a broken shebang, hence uvx.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="${JBM_SRC:-$HOME/chin/brand/fonts/JetBrainsMono-Regular.ttf}"
OUT="$ROOT/tools/jetbrains-mono-subset.b64"

if [[ ! -f "$SRC" ]]; then
  echo "error: JetBrains Mono not found at $SRC" >&2
  echo "       set JBM_SRC to override" >&2
  exit 1
fi

# Every glyph the hero, stats and grid can render. Keep this a superset of the
# copy in profile.json — a missing glyph silently falls back to system mono and
# breaks the alignment of a monospace layout.
GLYPHS='abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 .,:;/@$%&*()[]{}<>-_=+|!?#^~`'"'"'"·—–→←↑↓✓●▋⌥↵'

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

uvx --from 'fonttools[woff]' pyftsubset "$SRC" \
  --text="$GLYPHS" \
  --flavor=woff2 \
  --layout-features='' \
  --no-hinting \
  --desubroutinize \
  --output-file="$TMP/subset.woff2"

base64 < "$TMP/subset.woff2" | tr -d '\n' > "$OUT"

printf 'subset: %s bytes woff2 -> %s bytes base64\n' \
  "$(wc -c < "$TMP/subset.woff2" | tr -d ' ')" \
  "$(wc -c < "$OUT" | tr -d ' ')"
