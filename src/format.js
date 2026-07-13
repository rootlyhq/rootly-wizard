// Wrap a URL in an OSC 8 terminal hyperlink so supporting terminals render it
// as a clickable link. Keeps the URL itself as the visible text by default, so
// it stays readable/copyable where hyperlinks aren't supported. Non-TTY output
// (pipes, CI) returns the plain label.
export function hyperlink(url, label = url) {
  if (!process.stdout || !process.stdout.isTTY) return label;
  const OSC = ']8;;';
  const BEL = '';
  return `${OSC}${url}${BEL}${label}${OSC}${BEL}`;
}

// Copy text to the OS clipboard by piping into the platform's native tool.
// No deps: pbcopy (macOS), clip (Windows), xclip (Linux — must be installed).
// Resolves true on success, false if the command was missing or exited non-zero
// so the caller can surface a clean fallback message instead of throwing.
export async function copyToClipboard(text) {
  const { spawn } = await import('node:child_process');
  const [cmd, args] = process.platform === 'darwin'
    ? ['pbcopy', []]
    : process.platform === 'win32'
      ? ['clip', []]
      : ['xclip', ['-selection', 'clipboard']];
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(cmd, args, { stdio: ['pipe', 'ignore', 'ignore'] });
    } catch {
      resolve(false);
      return;
    }
    child.on('error', () => resolve(false));
    child.on('close', (code) => resolve(code === 0));
    try {
      child.stdin.end(String(text));
    } catch {
      resolve(false);
    }
  });
}

// Format an E.164-ish phone number for display. US/Canada (+1 + 10 digits)
// becomes +1 (415) 706-8600; anything else is returned as-is.
export function formatPhone(raw) {
  const s = String(raw || '').trim();
  const m = s.match(/^\+1(\d{3})(\d{3})(\d{4})$/);
  return m ? `+1 (${m[1]}) ${m[2]}-${m[3]}` : s;
}

// Turn a raw API/action error string into a short, human phrase suitable for a
// result screen. Passes already-clean text through unchanged, so it's safe to
// wrap any failure summary with it.
export function friendlyError(raw) {
  const s = String(raw || '');
  if (/already been taken|already exists/i.test(s)) return 'This already exists — it looks set up already.';
  if (/not found or unauthorized/i.test(s)) return 'Not permitted by this sign-in.';
  if (/\b429\b|rate limit/i.test(s)) return 'Rate limited — try again shortly.';
  // Pull a human detail out of a JSON error body if present.
  const brace = s.indexOf('{');
  if (brace !== -1) {
    try {
      const body = JSON.parse(s.slice(brace));
      const first = Array.isArray(body?.errors) ? body.errors[0] : null;
      const detail = first?.detail || first?.title
        || (body && typeof body === 'object' ? Object.values(body).flat()[0] : null);
      if (detail) return String(detail);
    } catch {
      // fall through
    }
  }
  // Strip a leading "NNN - " HTTP status prefix if present.
  return s.replace(/^\d{3}\s*-\s*/, '').trim() || 'Something went wrong. Please try again.';
}
