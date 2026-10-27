import { neon } from '@neondatabase/serverless';

function reply(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}

export default async function handler(request) {
  if (request.method !== 'GET') {
    return reply({ ok: false, error: 'Method not allowed' }, 405);
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return reply({
      ok: false,
      service: 'adlink-api',
      database: 'not-configured',
      message: 'DATABASE_URL is not configured for this deployment.',
    }, 503);
  }

  try {
    const sql = neon(databaseUrl);
    const result = await sql`
      SELECT
        current_database() AS database_name,
        EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'profiles') AS profiles_table,
        EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'placements') AS placements_table,
        EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'bookings') AS bookings_table
    `;
    const checks = result[0] || {};
    const ready = Boolean(checks.profiles_table && checks.placements_table && checks.bookings_table);

    return reply({
      ok: ready,
      service: 'adlink-api',
      database: ready ? 'connected' : 'schema-incomplete',
      checks: {
        profiles: Boolean(checks.profiles_table),
        placements: Boolean(checks.placements_table),
        bookings: Boolean(checks.bookings_table),
      },
      timestamp: new Date().toISOString(),
    }, ready ? 200 : 503);
  } catch (error) {
    console.error('Adlink health check failed', { message: error?.message });
    return reply({
      ok: false,
      service: 'adlink-api',
      database: 'unavailable',
      message: 'Database health check failed.',
    }, 503);
  }
}
