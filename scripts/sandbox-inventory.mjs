// Read-only: list resources in the Rootly account tied to the stored token.
import { getStoredToken, getAuthSummary } from '../src/auth.js';
import { RootlyApiClient } from '../src/rootly-api.js';

const token = await getStoredToken();
if (!token) {
  console.error('No stored token found.');
  process.exit(1);
}
const summary = await getAuthSummary();
console.log('Auth:', summary?.label, `(${summary?.mode})`);

const api = new RootlyApiClient(token);

const me = await api.getCurrentUser();
const userId = me?.data?.id;
console.log('\nCurrent user:', me?.data?.attributes?.email, 'id=', userId);

async function dump(label, fn) {
  try {
    const res = await fn();
    const rows = (res?.data || []).map((d) => ({ id: d.id, name: d.attributes?.name || d.attributes?.title || d.attributes?.phone_number || d.attributes?.number || d.attributes?.slug || '' }));
    console.log(`\n${label} (${rows.length}):`);
    for (const r of rows) console.log(`  ${r.id}  ${r.name}`);
    return rows;
  } catch (e) {
    console.log(`\n${label}: ERROR ${e.message}`);
    return [];
  }
}

await dump('Teams', () => api.listTeams());
await dump('Schedules', () => api.listSchedules());
await dump('Escalation policies', () => api.listEscalationPolicies());
await dump('Alert sources', () => api.listAlertSources());
await dump('Services', () => api.listServices());
await dump('Status pages', () => api.listStatusPages());
if (userId) await dump('Phone numbers', () => api.getUserPhoneNumbers(userId));
