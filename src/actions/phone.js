import { loadApiClient, extractUserId } from '../runtime.js';

function formatError(error) {
  return error?.message?.replace(/^Rootly API request failed for [^:]+:\s*/, '') || 'unknown error';
}

// Add a phone number to the signed-in user and trigger a verification SMS.
// Returns the new phone number id so the caller can submit the code next.
export async function startPhoneVerificationAction({ phone } = {}) {
  const clean = String(phone || '').trim();
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
