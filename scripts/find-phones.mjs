// Read-only: scan all users for phone numbers.
import { getStoredToken } from '../src/auth.js';
import { RootlyApiClient } from '../src/rootly-api.js';

const token = await getStoredToken();
const api = new RootlyApiClient(token);
const users = await api.listAllUsers();
console.log('Total users:', users.length);
for (const u of users) {
  try {
    const res = await api.getUserPhoneNumbers(u.id);
    const nums = res?.data || [];
    if (nums.length) {
      console.log(`user ${u.id} <${u.attributes?.email}>: ${nums.map(n => n.id + ' ' + (n.attributes?.phone_number || n.attributes?.number || '') + ' verified=' + n.attributes?.verified).join(' | ')}`);
    }
  } catch (e) {
    // ignore per-user errors
  }
}
console.log('done');
