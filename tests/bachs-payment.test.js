import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBachsAmountMinor } from '../api/payments.js';

test('parses Bachs decimal-string amounts into exact minor units', () => {
  assert.equal(parseBachsAmountMinor('12.34'), 1234);
  assert.equal(parseBachsAmountMinor('12'), 1200);
  assert.equal(parseBachsAmountMinor('0.01'), 1);
  assert.equal(parseBachsAmountMinor('999999999.99'), 99999999999);
});

test('rejects invalid, negative, over-precision, and unsafe Bachs amounts', () => {
  for (const value of ['', null, undefined, '-1.00', '1.234', '1e2', 'NaN', '90071992547409.92']) {
    assert.equal(parseBachsAmountMinor(value), null, String(value));
  }
});
