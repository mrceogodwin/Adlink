import { createHmac, timingSafeEqual } from 'node:crypto';

export function verifyPaystackSignature(rawBody, signature, secret) {
  if (typeof rawBody !== 'string' || typeof signature !== 'string' || typeof secret !== 'string' || !signature || !secret) return false;
  if (!/^[a-f0-9]{128}$/i.test(signature)) return false;
  const expected = createHmac('sha512', secret).update(rawBody).digest();
  const received = Buffer.from(signature, 'hex');
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export function normalizeCommissionBps(settingValue, fallback = 1500) {
  const candidate = settingValue && typeof settingValue === 'object'
    ? Number(settingValue.bps ?? settingValue.value ?? settingValue.rate_bps)
    : Number(settingValue);
  if (!Number.isFinite(candidate)) return fallback;
  return Math.min(10000, Math.max(0, Math.round(candidate)));
}

export function calculatePublisherNet(grossAmountMinor, commissionBps) {
  const gross = Number(grossAmountMinor);
  const bps = Number(commissionBps);
  if (!Number.isSafeInteger(gross) || gross < 0) throw new RangeError('Gross amount must be a non-negative safe integer.');
  if (!Number.isInteger(bps) || bps < 0 || bps > 10000) throw new RangeError('Commission must be between 0 and 10000 basis points.');
  const commissionAmountMinor = Math.round(gross * bps / 10000);
  return { commissionAmountMinor, netAmountMinor: gross - commissionAmountMinor };
}
