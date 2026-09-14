import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveApiUrl } from '../lib/api-endpoint';
import { createQueuedStorage } from '../lib/repository/queued-storage';

test('mobile API requires HTTPS and preserves web relative requests', () => {
  assert.equal(resolveApiUrl('/api/input-decision', ''), '/api/input-decision');
  assert.equal(resolveApiUrl('/api/input-decision', 'https://api.example.com/'), 'https://api.example.com/api/input-decision');
  for (const base of ['http://example.com', 'https://user:pass@example.com', 'https://example.com/path', 'https://example.com?token=x']) assert.throws(() => resolveApiUrl('/api/input-decision', base));
});
test('native persistence serializes writes and remains usable after a failed save', async () => {
  const writes: string[] = [];
  const storage = createQueuedStorage({ getItem: async () => null, setItem: async (_key, value) => { writes.push(value); if (value === 'bad') throw Error('disk'); } });
  const first = storage.setItem('state', 'bad');
  const second = storage.setItem('state', 'latest');
  await assert.rejects(first);
  await second;
  assert.deepEqual(writes, ['bad','latest']);
});

test('native CORS allows only configured origins including preflight', async () => {
  const { NextRequest } = await import('next/server');
  const { middleware } = await import('../middleware');
  const old = process.env.MOBILE_ALLOWED_ORIGINS;
  process.env.MOBILE_ALLOWED_ORIGINS = 'capacitor://localhost,https://localhost';
  try {
    const allowed = middleware(new NextRequest('https://api.example.com/api/input-decision', { method: 'OPTIONS', headers: { origin: 'capacitor://localhost' } }));
    assert.equal(allowed.status, 204);
    assert.equal(allowed.headers.get('access-control-allow-origin'), 'capacitor://localhost');
    const blocked = middleware(new NextRequest('https://api.example.com/api/input-decision', { method: 'POST', headers: { origin: 'https://evil.example.com' } }));
    assert.equal(blocked.status, 403);
    const local = middleware(new NextRequest('https://api.example.com/api/input-decision', { method: 'POST', headers: { origin: 'https://api.example.com' } }));
    assert.equal(local.headers.get('access-control-allow-origin'), null);
  } finally {
    if (old === undefined) delete process.env.MOBILE_ALLOWED_ORIGINS; else process.env.MOBILE_ALLOWED_ORIGINS = old;
  }
});
