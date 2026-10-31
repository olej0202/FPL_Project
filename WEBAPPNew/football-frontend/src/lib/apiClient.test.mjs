import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchJson } from './apiClient.js';
import { API_BASE_URL } from '../config/apiBase.js';

test('JSON transport keeps headers/signals and resolves relative API paths', async t => {
  const controller = new AbortController();
  const options = { headers: { Authorization: 'test-token' }, signal: controller.signal };
  t.mock.method(globalThis, 'fetch', async (url, received) => {
    assert.equal(url, `${API_BASE_URL}/Players`);
    assert.equal(received, options);
    return new Response(JSON.stringify([{ name: 'Player', Points: 5 }]));
  });
  assert.deepEqual(await fetchJson('/Players', options), [{ name: 'Player', Points: 5 }]);
});

test('HTTP failures cannot become successful cached data', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response('Unavailable', { status: 503 }));
  await assert.rejects(fetchJson('/Players'), error => error.status === 503);
});

test('network and cancellation errors remain observable to callers', async t => {
  const reason = new DOMException('Cancelled', 'AbortError');
  t.mock.method(globalThis, 'fetch', async () => { throw reason; });
  await assert.rejects(fetchJson('/Players'), error => error === reason);
});
