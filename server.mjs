import http from 'node:http';
import { createHash, timingSafeEqual } from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { pathToFileURL } from 'node:url';

const GOOGLE = 'https://generativelanguage.googleapis.com/v1beta/openai';
const digest = value => createHash('sha256').update(value).digest();
const fail = (res, status, code) => {
  if (!res.headersSent) res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify({ error: { code } }));
};

// No application code, business records, third-party packages or old credentials.
export function createProxy({ apiKey, proxyToken, allowedModels = ['gemini-3.8-flash'], fetchImpl = fetch, timeoutMs = 60000, maxBytes = 1048576, maxConcurrent = 2 }) {
  if (!apiKey || !proxyToken || proxyToken.length < 32) throw new Error('Set GEMINI_API_KEY and a PROXY_AUTH_TOKEN of at least 32 characters');
  const models = new Set(allowedModels.filter(Boolean));
  if (!models.size) throw new Error('Set at least one allowed model');
  let active = 0;
  return http.createServer(async (req, res) => {
    if (req.method === 'GET' && req.url === '/health') return fail(res, 200, 'OK');
    const auth = String(req.headers.authorization || '');
    if (!timingSafeEqual(digest(auth), digest(`Bearer ${proxyToken}`))) return fail(res, 401, 'UNAUTHORIZED');
    const route = req.method === 'GET' && req.url === '/v1/models' ? 'models'
      : req.method === 'POST' && req.url === '/v1/chat/completions' ? 'chat/completions' : '';
    if (!route) return fail(res, 404, 'NOT_FOUND');
    if (active >= maxConcurrent) return fail(res, 429, 'BUSY');
    active++;
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), timeoutMs);
    req.once('aborted', () => abort.abort());
    res.once('close', () => { if (!res.writableEnded) abort.abort(); });
    try {
      let body;
      if (req.method === 'POST') {
        if (!String(req.headers['content-type'] || '').startsWith('application/json')) return fail(res, 415, 'JSON_REQUIRED');
        let size = 0; const chunks = [];
        for await (const chunk of req) {
          size += chunk.length;
          if (size > maxBytes) return fail(res, 413, 'BODY_TOO_LARGE');
          chunks.push(chunk);
        }
        try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return fail(res, 400, 'INVALID_JSON'); }
        if (!body || typeof body !== 'object' || !models.has(body.model) || !Array.isArray(body.messages) || !body.messages.length) return fail(res, 400, 'INVALID_MODEL_OR_MESSAGES');
        const fields = new Set(['model', 'messages', 'temperature', 'tools', 'tool_choice', 'stream', 'stream_options', 'max_tokens', 'response_format']);
        if (Object.keys(body).some(key => !fields.has(key))) return fail(res, 400, 'UNSUPPORTED_FIELD');
      }
      const response = await fetchImpl(`${GOOGLE}/${route}`, {
        method: req.method, redirect: 'error', signal: abort.signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      if (!response.ok) { await response.body?.cancel(); return fail(res, response.status, 'UPSTREAM_REJECTED'); }
      if (route === 'models') {
        const data = await response.json();
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        return res.end(JSON.stringify({ object: 'list', data: (Array.isArray(data.data) ? data.data : []).filter(model => models.has(model.id)) }));
      }
      if (!response.body) return fail(res, 502, 'EMPTY_UPSTREAM');
      res.writeHead(200, { 'Content-Type': body.stream ? 'text/event-stream' : 'application/json', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' });
      await pipeline(Readable.fromWeb(response.body), res, { signal: abort.signal });
    } catch {
      if (!res.headersSent) fail(res, abort.signal.aborted ? 504 : 502, 'UPSTREAM_UNAVAILABLE');
      else res.destroy(); // A partial stream is never turned into a fake successful response.
    } finally { clearTimeout(timer); active--; }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT || 9000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
  createProxy({ apiKey: process.env.GEMINI_API_KEY, proxyToken: process.env.PROXY_AUTH_TOKEN,
    allowedModels: (process.env.ALLOWED_MODELS || 'gemini-3.8-flash').split(',').map(x => x.trim()) })
    .listen(port, process.env.LISTEN_HOST || '127.0.0.1');
}
