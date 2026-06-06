import { createElement as h, useEffect, useState } from 'react';
import { Box } from 'ink';
import { AppShell } from '../components/AppShell.js';
import { Banner } from '../components/Banner.js';
import { SlideReveal } from '../components/SlideReveal.js';
import { MenuList } from '../components/MenuList.js';
import { palette } from '../theme.js';

// Ramp tops out at the muted resting color so inactive rows (e.g. Exit) don't
// overshoot to near-white and flash; only the selected row brightens on arrival.
const MENU_RAMP = ['#3C3C46', '#56565F', '#71717C', '#8B8B97'];

export function WelcomeScreen({ lines, onContinue, onExit }) {
  // Stage the entrance: banner flashes in, the copy slides in, then the menu
  // fades in once the copy has landed.
  const [phase, setPhase] = useState(0);
  const [menuStep, setMenuStep] = useState(0);

  useEffect(() => {
    const startReveal = setTimeout(() => setPhase(1), 650);
    return () => clearTimeout(startReveal);
  }, []);

  useEffect(() => {
    if (phase < 2 || menuStep >= MENU_RAMP.length) return undefined;
    const tick = setTimeout(() => setMenuStep((current) => current + 1), 70);
    return () => clearTimeout(tick);
  }, [phase, menuStep]);

  const menuTint = phase >= 2 && menuStep < MENU_RAMP.length ? MENU_RAMP[menuStep] : undefined;

  const menuOptions = [
    { label: 'Continue', value: 'continue' },
    { label: 'Exit', value: 'exit' }
  ];

  // Reserve the copy and menu rows up front so the bordered card opens at its
  // final size — sections fade in within this fixed footprint instead of
  // stretching the box as each stage arrives.
  return h(
    AppShell,
    { context: 'welcome', keyColor: palette.accent },
    h(Banner, null),
    h(
      Box,
      { flexDirection: 'column', minHeight: lines.length },
      phase >= 1 ? h(SlideReveal, { lines, onDone: () => setPhase(2) }) : null
    ),
    h(
      Box,
      { marginTop: 1, minHeight: menuOptions.length },
      phase >= 2
        ? h(MenuList, {
            tint: menuTint,
            options: menuOptions,
            onSelect: (option) => {
              if (option.value === 'continue') onContinue?.();
              else onExit?.();
            },
            onCancel: onExit
          })
        : null
    )
  );
}
