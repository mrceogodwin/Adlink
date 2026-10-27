import test from 'node:test';
import assert from 'node:assert/strict';
import { vercelHandler } from '../lib/vercel-handler.js';

function makeResponse() {
  return {
    statusCode: 0,
    headers: {},
    headersSent: false,
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    end(value = '') {
      this.body = Buffer.isBuffer(value) ? value.toString('utf8') : String(value);
      this.headersSent = true;
    },
  };
}

test('adapts a Vercel Node request to a Web Request and writes the Web Response', async () => {
  const handler = vercelHandler(async request => {
    assert.ok(request instanceof Request);
    assert.equal(request.url, 'https://adlink.example/api/auth?action=register');
    assert.equal(request.headers.get('origin'), 'https://adlink.example');
    const body = await request.json();
    return new Response(JSON.stringify({ method: request.method, body }), {
      status: 201,
      headers: { 'content-type': 'application/json', 'set-cookie': 'adlink_session=example; HttpOnly; Secure' },
    });
  });

  const req = {
    method: 'POST',
    url: '/api/auth?action=register',
    headers: {
      host: 'adlink.example',
      'x-forwarded-proto': 'https',
      origin: 'https://adlink.example',
      'content-type': 'application/json',
    },
    body: { email: 'test@example.com', role: 'advertiser' },
  };
  const res = makeResponse();
  await handler(req, res);

  assert.equal(res.statusCode, 201);
  assert.equal(res.headers['content-type'], 'application/json');
  assert.match(res.headers['set-cookie'], /HttpOnly/);
  assert.deepEqual(JSON.parse(res.body), {
    method: 'POST',
    body: { email: 'test@example.com', role: 'advertiser' },
  });
});

test('adapts a GET request with a relative URL and no body', async () => {
  const handler = vercelHandler(async request => new Response(JSON.stringify({
    path: new URL(request.url).pathname,
    query: new URL(request.url).searchParams.get('action'),
    method: request.method,
  })));
  const req = {
    method: 'GET',
    url: '/api/auth?action=me',
    headers: { host: 'adlink.example', 'x-forwarded-proto': 'https' },
  };
  const res = makeResponse();
  await handler(req, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(JSON.parse(res.body), {
    path: '/api/auth',
    query: 'me',
    method: 'GET',
  });
});
