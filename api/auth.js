import login from './auth/login.js';
import register from './auth/register.js';
import me from './auth/me.js';
import logout from './auth/logout.js';
import { json } from '../lib/auth.js';

// Compatibility router. All actions use the same signed-cookie authentication implementation.
export default async function handler(request) {
  const action = new URL(request.url).searchParams.get('action') || (request.method === 'GET' ? 'me' : '');
  if (action === 'me') return me(request);
  if (action === 'login') return login(request);
  if (action === 'register') return register(request);
  if (action === 'logout') return logout(request);
  return json({ error: 'Unknown authentication action.' }, 404);
}
