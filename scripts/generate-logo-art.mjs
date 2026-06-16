// Rasterize the Rootly sprout glyph and pattern-match each character cell to a
// Unicode HALF-block (▀ ▄ █): 1x2 subpixels/cell, full-width so the art tiles
// cleanly without floating partial-cell specks. Run:
//   node scripts/generate-logo-art.mjs [cols] [rows]
// Prints the block art; copy it into src/tui/components/Banner.js.
import { execSync } from 'node:child_process';

const HALF = [' ', '▄', '▀', '█']; // (top<<1)|bottom
const SRC = 'assets/rootly-logo-glyph.png';

export function blockify(cols, rows, src = SRC) {
  const W = cols, H = rows * 2; // 1 horizontal, 2 vertical subpixels per cell
  // -trim removes the transparent padding so the glyph fills the grid.
  const out = execSync(
    `magick "${src}" -background white -alpha remove -alpha off -trim +repage ` +
    `-resize ${W}x${H}! -colorspace Gray -threshold 55% txt:-`,
    { encoding: 'utf8', maxBuffer: 1 << 24 }
  );
  const ink = Array.from({ length: H }, () => new Array(W).fill(0));
  for (const line of out.split('\n')) {
    const m = line.match(/^(\d+),(\d+):/);
    if (!m) continue;
    const x = +m[1], y = +m[2];
    if (y >= H || x >= W) continue;
    const g = /gray\((\d+)/.exec(line);
    ink[y][x] = (/#000000|black/i.test(line) || (g && +g[1] < 128)) ? 1 : 0;
  }
  const lines = [];
  for (let r = 0; r < rows; r++) {
    let s = '';
    for (let c = 0; c < cols; c++) {
      const top = ink[r * 2][c], bottom = ink[r * 2 + 1][c];
      s += HALF[(top << 1) | bottom];
    }
    lines.push(s.replace(/\s+$/, ''));
  }
  return lines;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  // Cells are ~1:2 (w:h); cols ≈ 2*rows keeps the square glyph square.
  const rows = +(process.argv[3] || 11);
  const cols = +(process.argv[2] || rows * 2);
  console.log(JSON.stringify(blockify(cols, rows), null, 2));
  console.log('\npreview:\n' + blockify(cols, rows).join('\n'));
}
