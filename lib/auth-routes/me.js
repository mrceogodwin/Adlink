import { json, requireSession } from '../auth.js';

export default async function handler(request) {
  if (request.method !== 'GET') return json({ error: 'Method not allowed.' }, 405, { allow: 'GET' });
  const result = await requireSession(request);
  if (result.error) return result.error;
  return json({ profile: result.profile });
}
