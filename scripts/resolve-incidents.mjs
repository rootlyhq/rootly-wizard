import { getStoredToken } from '../src/auth.js';
import { RootlyApiClient } from '../src/rootly-api.js';

const api = new RootlyApiClient(await getStoredToken());

// Collect all incidents across pages.
const all = [];
let next = '/v1/incidents?page[size]=100';
while (next) {
  const res = await api.request(next);
  for (const d of res?.data || []) all.push(d);
  const link = res?.links?.next;
  next = link ? link.replace('https://api.rootly.com', '') : null;
}
console.log('Total incidents:', all.length);

let resolved = 0, skipped = 0, failed = 0;
for (const i of all) {
  const status = i.attributes?.status;
  if (status === 'resolved' || status === 'cancelled' || status === 'closed') { skipped++; continue; }
  try {
    await api.request('/v1/incidents/' + i.id, { method: 'PATCH', body: { data: { id: i.id, type: 'incidents', attributes: { status: 'resolved' } } } });
    resolved++;
  } catch (e) {
    failed++;
    console.log('  ✗', i.id, e.message.slice(0, 120));
  }
}
console.log(`Resolved: ${resolved}, already-closed: ${skipped}, failed: ${failed}`);

// Retry service deletes now that incidents are resolved.
const services = (await api.request('/v1/services'))?.data || [];
console.log('\nRetrying service deletes:', services.length);
for (const s of services) {
  try {
    await api.request('/v1/services/' + s.id, { method: 'DELETE' });
    console.log('  ✓', s.attributes?.name);
  } catch (e) {
    console.log('  ✗', s.attributes?.name, '—', e.message.slice(0, 140));
  }
}
