import { json } from '../lib/auth.js';

export default async function handler(request) {
  const url = new URL(request.url);
  const action = url.searchParams.get('action') || (request.method === 'GET' ? 'me' : '');
  const routes = { me: '/api/auth/me', login: '/api/auth/login', register: '/api/auth/register', logout: '/api/auth/logout' };
  const target = routes[action];
  if (!target) return json({ error: 'Unknown authentication action.' }, 404);
  const headers = new Headers({ location: target, 'cache-control': 'no-store' });
  return new Response(null, { status: 307, headers });
}
