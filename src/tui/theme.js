// Shared design tokens for the Ink wizard UI.
// Playful-yet-professional: warm Rootly brand accent, soft purple secondary,
// restrained neutrals, and a small glyph set used consistently across screens.

export const palette = {
  brand: '#F9BD2B',   // Rootly yellow — primary accent / selection
  accent: '#B197FC',  // soft purple — numbers, bullets, secondary accent
  text: '#E8E8EA',    // primary text
  muted: '#8B8B97',   // secondary / hint text
  success: '#5BD18B',
  warning: '#F4C152',
  danger: '#F4787B',
  border: '#3C3C46',  // panel borders, inactive glyphs
};

// Subtle resting shimmer — a faint highlight drifting over the brand base
// (no white, no dark dips), so the settled wordmark only gently glints.
export const shimmerRamp = [
  '#F9BD2B',
  '#F9BD2B',
  '#F9BD2B',
  '#FBC846',
  '#FDD261',
  '#FBC846',
  '#F9BD2B',
  '#F9BD2B',
  '#F9BD2B',
  '#F9BD2B',
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
    { key: 'space', label: 'toggle' },
    { key: '↵', label: 'confirm' },
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
