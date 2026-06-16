// Rasterize the Rootly sprout glyph and pattern-match each character cell to a
// Unicode quadrant block (2x2 subpixels/cell). Run:
//   node scripts/generate-logo-art.mjs [cols] [rows]
// Prints the block art; copy it into src/tui/components/Banner.js.
import { execSync } from 'node:child_process';

const QUAD = [' ','▗','▖','▄','▝','▐','▞','▟','▘','▚','▌','▙','▀','▜','▛','█'];
const SRC = 'assets/rootly-logo-glyph.png';

export function blockify(cols, rows, src = SRC) {
  const W = cols * 2, H = rows * 2;
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
      const tl = ink[r*2][c*2], tr = ink[r*2][c*2+1];
      const bl = ink[r*2+1][c*2], br = ink[r*2+1][c*2+1];
      s += QUAD[(tl<<3)|(tr<<2)|(bl<<1)|br];
    }
    lines.push(s.replace(/\s+$/, ''));
  }
  return lines;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const cols = +(process.argv[2] || 22);
  const rows = +(process.argv[3] || 11);
  console.log(JSON.stringify(blockify(cols, rows), null, 2));
  console.log('\npreview:\n' + blockify(cols, rows).join('\n'));
}
