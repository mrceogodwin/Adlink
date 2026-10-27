import { db, json, requireSession, checkSameOrigin } from '../lib/auth.js';

const objectives = new Set(['awareness','traffic','leads','sales','community','other']);
const dateOrNull = value => value ? String(value).slice(0,10) : null;

export default async function handler(request) {
  const auth = await requireSession(request);
  if (auth.error) return auth.error;
  if (auth.profile.role !== 'advertiser') return json({ error: 'Only advertiser accounts can manage campaigns.' }, 403);
  const sql = db();
  if (request.method === 'GET') {
    try {
      const rows = await sql`SELECT id, name, objective, brief, budget_minor, currency, start_date, end_date, status, created_at, updated_at FROM campaigns WHERE advertiser_id = ${auth.profile.id} ORDER BY created_at DESC LIMIT 100`;
      return json({ data: rows });
    } catch (error) {
      console.error('Campaign list failed', { message: error?.message });
      return json({ error: 'Could not load campaigns.' }, 500);
    }
  }
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405, { allow: 'GET, POST' });
  if (!checkSameOrigin(request)) return json({ error: 'Cross-origin request rejected.' }, 403);
  try {
    const body = await request.json();
    const name = String(body.name || '').trim();
    const objective = String(body.objective || '');
    const brief = String(body.brief || '').trim();
    const budget = Number(body.budget);
    const startDate = dateOrNull(body.start_date);
    const endDate = dateOrNull(body.end_date);
    if (name.length < 3 || name.length > 120) return json({ error: 'Campaign name must be 3–120 characters.' }, 400);
    if (!objectives.has(objective)) return json({ error: 'Choose a valid campaign objective.' }, 400);
    if (brief.length < 10 || brief.length > 5000) return json({ error: 'Campaign brief must be 10–5,000 characters.' }, 400);
    if (!Number.isFinite(budget) || budget < 100 || budget > 1000000000) return json({ error: 'Enter a budget between ₦100 and ₦1,000,000,000.' }, 400);
    if (startDate && !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return json({ error: 'Invalid start date.' }, 400);
    if (endDate && !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) return json({ error: 'Invalid end date.' }, 400);
    if (startDate && endDate && endDate < startDate) return json({ error: 'End date cannot be before the start date.' }, 400);
    const rows = await sql`INSERT INTO campaigns (advertiser_id, name, objective, brief, budget_minor, currency, start_date, end_date, status) VALUES (${auth.profile.id}, ${name}, ${objective}, ${brief}, ${Math.round(budget * 100)}, 'NGN', ${startDate}, ${endDate}, 'draft') RETURNING id, name, objective, brief, budget_minor, currency, start_date, end_date, status, created_at`;
    return json({ campaign: rows[0] }, 201);
  } catch (error) {
    console.error('Campaign creation failed', { message: error?.message, code: error?.code });
    return json({ error: 'Could not create campaign. Please try again.' }, 500);
  }
}
