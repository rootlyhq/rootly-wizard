import { createElement as h, useEffect, useState } from 'react';
import { Box, Text } from 'ink';

// A lively row of party symbols that shuffle every frame — a bit of fanfare
// for the "you're incident-ready" moment.
const SYMBOLS = ['🎉', '🎊', '✨', '🥳', '🎈', '⭐', '🪅'];

export function Celebration() {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setFrame((f) => f + 1), 180);
    return () => clearInterval(timer);
  }, []);

  // Five slots, each reading the symbol ring at a different offset, so the row
  // appears to dance rather than march in lockstep.
  const at = (offset) => SYMBOLS[(frame + offset) % SYMBOLS.length];
  const row = `${at(0)}  ${at(3)}  ${at(1)}  ${at(4)}  ${at(2)}`;

  return h(
    Box,
    { justifyContent: 'center', marginBottom: 1 },
    h(Text, null, row)
  );
}
