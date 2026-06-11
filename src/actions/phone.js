import { loadApiClient, extractUserId } from '../runtime.js';

function formatError(error) {
  return error?.message?.replace(/^Rootly API request failed for [^:]+:\s*/, '') || 'unknown error';
}

// Browser (OAuth) sign-ins can't manage phone numbers yet (403/404). Surface a
// clear next step instead of the raw API error.
function isPermissionFailure(error) {
  const message = error?.message || '';
  return /\b40[134]\b/.test(message) || /Not found or unauthorized/i.test(message);
}

const PHONE_BLOCKED_MESSAGE =
  'This sign-in can’t add phone numbers. Sign in with an API token, or add your number in the Rootly app.';

// Add a phone number to the signed-in user and trigger a verification SMS.
// Returns the new phone number id so the caller can submit the code next.
export async function startPhoneVerificationAction({ phone } = {}) {
  // Strip spaces, parens, dashes, dots; keep digits and a leading "+". A US
  // number works without a country code (Rootly normalizes with a US default).
  const clean = String(phone || '').replace(/[()\s.\-]/g, '').trim();
  if (!clean) {
    return { ok: false, summary: 'A phone number is required.' };
  }

  const api = await loadApiClient();
  const currentUser = await api.getCurrentUser();
  const userId = extractUserId(currentUser);
  if (!userId) {
    return { ok: false, summary: 'Could not resolve the current user.' };
  }

  let phoneNumberId = null;
  try {
    const created = await api.createUserPhoneNumber(userId, clean);
    phoneNumberId = created?.data?.id || null;
  } catch (error) {
    if (isPermissionFailure(error)) {
      return { ok: false, summary: PHONE_BLOCKED_MESSAGE };
    }
    return { ok: false, summary: `Could not add the phone number: ${formatError(error)}` };
  }
  if (!phoneNumberId) {
    return { ok: false, summary: 'The phone number could not be created.' };
  }

  try {
    await api.sendPhoneVerification(phoneNumberId);
  } catch (error) {
    // Remove the unverified number so a retry starts clean.
    try {
      await api.deleteUserPhoneNumber(phoneNumberId);
    } catch {
      // best-effort cleanup
    }
    if (isPermissionFailure(error)) {
      return { ok: false, summary: PHONE_BLOCKED_MESSAGE };
    }
    return { ok: false, summary: `Could not send a verification code: ${formatError(error)}` };
  }

  return {
    ok: true,
    summary: `Sent a verification code to ${clean}.`,
    data: { phoneNumberId, phone: clean }
  };
}

export async function confirmPhoneVerificationAction({ phoneNumberId, code } = {}) {
  const cleanCode = String(code || '').trim();
  if (!phoneNumberId) {
    return { ok: false, summary: 'Missing the phone number to verify.' };
  }
  if (!cleanCode) {
    return { ok: false, summary: 'A verification code is required.' };
  }

  const api = await loadApiClient();
  try {
    await api.submitPhoneVerificationCode(phoneNumberId, cleanCode);
    return { ok: true, summary: 'Phone number verified.', data: { phoneNumberId } };
  } catch (error) {
    return { ok: false, summary: `Could not verify the code: ${formatError(error)}` };
  }
}

export async function resendPhoneVerificationAction({ phoneNumberId } = {}) {
  if (!phoneNumberId) {
    return { ok: false, summary: 'Missing the phone number.' };
  }

  const api = await loadApiClient();
  try {
    await api.resendPhoneVerification(phoneNumberId);
    return { ok: true, summary: 'Sent a new verification code.', data: { phoneNumberId } };
  } catch (error) {
    return { ok: false, summary: `Could not resend the code: ${formatError(error)}` };
  }
}
