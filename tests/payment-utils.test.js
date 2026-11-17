import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { verifyPaystackSignature, normalizeCommissionBps } from '../lib/payment-utils.js';

test('accepts a valid Paystack SHA-512 signature for the exact raw body', () => {
  const rawBody = JSON.stringify({ event: 'charge.success', data: { reference: 'adlink_test' } });
  const secret = 'test-secret';
  const signature = createHmac('sha512', secret).update(rawBody).digest('hex');
  assert.equal(verifyPaystackSignature(rawBody, signature, secret), true);
});

test('rejects a signature when the raw body has been changed', () => {
  const secret = 'test-secret';
  const signature = createHmac('sha512', secret).update('original').digest('hex');
  assert.equal(verifyPaystackSignature('tampered', signature, secret), false);
});

test('rejects missing, malformed, and wrong-length signatures safely', () => {
  assert.equal(verifyPaystackSignature('{}', '', 'secret'), false);
  assert.equal(verifyPaystackSignature('{}', 'not-hex', 'secret'), false);
  assert.equal(verifyPaystackSignature('{}', 'abcd', 'secret'), false);
  assert.equal(verifyPaystackSignature('{}', 'a'.repeat(128), ''), false);
});

test('normalizes configured commission values and clamps to valid basis points', () => {
  assert.equal(normalizeCommissionBps(1500), 1500);
  assert.equal(normalizeCommissionBps({ bps: 1750 }), 1750);
  assert.equal(normalizeCommissionBps({ value: 1200 }), 1200);
  assert.equal(normalizeCommissionBps({ rate_bps: 900 }), 900);
  assert.equal(normalizeCommissionBps(12000), 10000);
  assert.equal(normalizeCommissionBps(-20), 0);
  assert.equal(normalizeCommissionBps('not-a-number'), 1500);
  assert.equal(normalizeCommissionBps(null), 0);
});
