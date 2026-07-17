// DESTRUCTIVE: deletes wizard-created resources from the account tied to the
// stored token, in dependency-safe order. Read-only inventory first.
import { getStoredToken } from '../src/auth.js';
import { RootlyApiClient } from '../src/rootly-api.js';

const token = await getStoredToken();
if (!token) {
  console.error('No token.');
  process.exit(1);
}
const api = new RootlyApiClient(token);

async function del(path) {
  await api.request(path, { method: 'DELETE' });
}

async function wipe(label, listPath, delPath) {
  let res;
  try {
    res = await api.request(listPath);
  } catch (e) {
    console.log(`\n${label}: list failed — ${e.message}`);
    return;
  }
  const items = res?.data || [];
  console.log(`\n${label}: ${items.length} to delete`);
  for (const it of items) {
    const name = it.attributes?.name || it.attributes?.title || it.attributes?.slug || it.id;
    try {
      await del(delPath(it.id));
      console.log(`  ✓ ${name}`);
    } catch (e) {
      console.log(`  ✗ ${name} — ${e.message}`);
    }
  }
}

// Order matters: dependents before dependencies.
await wipe('Status pages', '/v1/status-pages', (id) => `/v1/status-pages/${id}`);
await wipe('Alert sources', '/v1/alert_sources', (id) => `/v1/alert_sources/${id}`);
await wipe('Escalation policies', '/v1/escalation_policies', (id) => `/v1/escalation_policies/${id}`);
await wipe('Schedules', '/v1/schedules', (id) => `/v1/schedules/${id}`);
await wipe('Services', '/v1/services', (id) => `/v1/services/${id}`);
await wipe('Teams', '/v1/teams', (id) => `/v1/teams/${id}`);

// Phone numbers: scan all users, delete every number found.
console.log('\nPhone numbers:');
const users = await api.listAllUsers();
for (const u of users) {
  let nums = [];
  try {
    nums = (await api.getUserPhoneNumbers(u.id))?.data || [];
  } catch { /* ignore */ }
  for (const n of nums) {
    try {
      await api.deleteUserPhoneNumber(n.id);
      console.log(`  ✓ ${u.attributes?.email}: ${n.attributes?.phone_number || n.id}`);
    } catch (e) {
      console.log(`  ✗ ${u.attributes?.email}: ${n.id} — ${e.message}`);
    }
  }
}

console.log('\nDone.');
