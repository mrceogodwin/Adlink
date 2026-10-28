import test from 'node:test';
import assert from 'node:assert/strict';

const apiModules = [
  '../api/admin-overview.js',
  '../api/admin-actions.js',
  '../api/auth.js',
  '../api/bookings.js',
  '../api/campaigns.js',
  '../api/dashboard.js',
  '../api/health.js',
  '../api/listings.js',
  '../api/publisher-placements.js',
  '../api/payments.js',
  '../api/saved-placements.js',
];

test('all Vercel API entry points load without module export errors', async () => {
  for (const path of apiModules) {
    const module = await import(path);
    assert.equal(typeof module.default, 'function', `${path} must default-export a handler`);
  }
});

test('shared auth response helper is exported for API routes', async () => {
  const auth = await import('../lib/auth.js');
  assert.equal(typeof auth.json, 'function');
  assert.equal(typeof auth.requireSession, 'function');
});
