// Shared design tokens for the Ink wizard UI.
// Aligned to the Rootly brand guidelines: purple is primary (P700 is the
// official *brand color), orange is the secondary accent, restrained neutrals,
// and a small glyph set used consistently across screens.
//
// Brand ramp for reference — P900 #3B2D7A · P800 #5942B5 · P700 #7C5CE6 (*brand)
// · P500 #9D86F0 · P300 #C9BEF7 · P200 #E0DAFB · P100 #F2EFFC.
// Secondary orange — S900 #E8822E · S700 #F5A24F · S500 #F9C58A.

export const palette = {
  brand: '#7C5CE6',   // Rootly purple (P700, *brand color) — primary accent / selection
  accent: '#F5A24F',  // brand orange (S700) — numbers, bullets, secondary accent
  text: '#ECECEE',    // primary text (N100)
  muted: '#8B8B97',   // secondary / hint text (N500)
  success: '#5BD18B',
  warning: '#E8822E', // brand orange (S900)
  danger: '#F4787B',
  border: '#3C3C46',  // panel borders, inactive glyphs (N900→N700)
};

// Subtle resting shimmer — a faint highlight drifting over the purple brand
// base (no white, no dark dips), so the settled wordmark only gently glints.
export const shimmerRamp = [
  '#7C5CE6',
  '#7C5CE6',
  '#7C5CE6',
  '#8D70EB',
  '#A289F1',
  '#8D70EB',
  '#7C5CE6',
  '#7C5CE6',
  '#7C5CE6',
  '#7C5CE6',
];

export const glyphs = {
  logo: '✦',
  cursor: '❯',
  dot: '•',
  star: '★',
  check: '◉',
  uncheck: '◯',
  barOn: '▰',
  barOff: '▱',
  more: '·',
};

// Footer key-hint presets. Each item renders as a brand-colored key + muted label.
export const HINTS = {
  nav: [
    { key: '↑↓', label: 'navigate' },
    { key: '1–9', label: 'jump' },
    { key: 'esc', label: 'back' },
  ],
  multi: [
    { key: '↵/space', label: 'check' },
    { key: 'a', label: 'all' },
    { key: 'esc', label: 'back' },
  ],
  entry: [
    { key: 'type', label: 'to edit' },
    { key: '↵', label: 'continue' },
    { key: 'esc', label: 'back' },
  ],
  back: [
    { key: 'esc', label: 'back' },
  ],
  none: [],
};
