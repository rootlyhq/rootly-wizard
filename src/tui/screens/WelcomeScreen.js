import { createElement as h, useEffect, useState } from 'react';
import { Box } from 'ink';
import { AppShell } from '../components/AppShell.js';
import { Banner } from '../components/Banner.js';
import { SlideReveal } from '../components/SlideReveal.js';
import { MenuList } from '../components/MenuList.js';

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

  return h(
    AppShell,
    { context: 'get started' },
    h(Banner, null),
    phase >= 1
      ? h(
          Box,
          { flexDirection: 'column' },
          h(SlideReveal, { lines, onDone: () => setPhase(2) })
        )
      : null,
    phase >= 2
      ? h(
          Box,
          { marginTop: 1 },
          h(MenuList, {
            tint: menuTint,
            options: [
              { label: 'Continue', value: 'continue' },
              { label: 'Exit', value: 'exit' }
            ],
            onSelect: (option) => {
              if (option.value === 'continue') onContinue?.();
              else onExit?.();
            },
            onCancel: onExit
          })
        )
      : null
  );
}
