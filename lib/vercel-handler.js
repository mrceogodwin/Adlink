// Adapts Vercel's Node.js Serverless Function request/response objects to
// the Web Request/Response API used by the application handlers.
export function vercelHandler(handler) {
  return async function nodeHandler(req, res) {
    try {
      const forwardedProto = req.headers?.['x-forwarded-proto'];
      const protocol = (Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto || 'https').split(',')[0].trim();
      const hostHeader = req.headers?.host || 'localhost';
      const host = Array.isArray(hostHeader) ? hostHeader[0] : hostHeader;
      const url = new URL(req.url || '/', `${protocol}://${host}`);

      const headers = new Headers();
      for (const [name, raw] of Object.entries(req.headers || {})) {
        if (raw === undefined) continue;
        if (Array.isArray(raw)) {
          for (const value of raw) headers.append(name, String(value));
        } else {
          headers.set(name, String(raw));
        }
      }

      const method = String(req.method || 'GET').toUpperCase();
      let body;
      if (method !== 'GET' && method !== 'HEAD') {
        if (req.body !== undefined && req.body !== null) {
          body = Buffer.isBuffer(req.body) || typeof req.body === 'string'
            ? req.body
            : JSON.stringify(req.body);
        } else {
          const chunks = [];
          for await (const chunk of req) chunks.push(Buffer.from(chunk));
          if (chunks.length) body = Buffer.concat(chunks);
        }
      }

      const webRequest = new Request(url, {
        method,
        headers,
        ...(body === undefined ? {} : { body }),
      });
      const webResponse = await handler(webRequest);
      res.statusCode = webResponse.status || 200;
      webResponse.headers.forEach((value, name) => res.setHeader(name, value));
      const bytes = await webResponse.arrayBuffer();
      res.end(Buffer.from(bytes));
    } catch (error) {
      console.error('API adapter failed', { message: error?.message });
      if (res.headersSent) return res.end();
      res.statusCode = 500;
      res.setHeader('content-type', 'application/json; charset=utf-8');
      res.setHeader('cache-control', 'no-store');
      res.end(JSON.stringify({ error: 'Internal server error.' }));
    }
  };
}
