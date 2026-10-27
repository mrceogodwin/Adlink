import { json } from '../lib/auth.js';
import login from '../lib/auth-routes/login.js';
import register from '../lib/auth-routes/register.js';
import logout from '../lib/auth-routes/logout.js';
import me from '../lib/auth-routes/me.js';

// Keep all auth actions in one Vercel function to stay within the Hobby-plan
// function limit. Existing /api/auth/<action> URLs are rewritten in vercel.json.
const handlers = { login, register, logout, me };

export default async function handler(request) {
  const url = new URL(request.url);
  const action = url.searchParams.get('action') || (request.method === 'GET' ? 'me' : '');
  const selected = handlers[action];
  if (!selected) return json({ error: 'Unknown authentication action.' }, 404);
  return selected(request);
}
