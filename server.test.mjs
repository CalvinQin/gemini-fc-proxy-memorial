import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import http from 'node:http';
import { createProxy } from './server.mjs';
const token = 'synthetic-only-proxy-token-at-least-32-chars';
async function fixture(t, upstream, options={}) {
 const server=createProxy({...options,apiKey:'synthetic-google-key',proxyToken:token,fetchImpl:upstream});
 server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));
 const send=(path, options={})=>fetch(`http://127.0.0.1:${server.address().port}${path}`, { ...options, headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json',...options.headers} });
 send.origin=`http://127.0.0.1:${server.address().port}`;send.server=server;return send;
}
test('fails closed with missing credentials',()=>assert.throws(()=>createProxy({}),/Set GEMINI_API_KEY/));
test('auth rejects before contacting Google',async t=>{const send=await fixture(t,()=>assert.fail('network'));assert.equal((await send('/v1/models',{headers:{Authorization:'Bearer wrong'}})).status,401);});
test('rejects arbitrary proxy destinations and unknown routes',async t=>{const send=await fixture(t,()=>assert.fail('network'));assert.equal((await send('/v1/chat/completions',{method:'POST',body:JSON.stringify({model:'gemini-3.8-flash',messages:[{role:'user',content:'test'}],baseUrl:'http://169.254.169.254'})})).status,400);assert.equal((await send('/https://attacker.test')).status,404);});
test('lists only allowed models and uses server credentials with redirects blocked',async t=>{const send=await fixture(t,(url,options)=>{assert.equal(url,'https://generativelanguage.googleapis.com/v1beta/openai/models');assert.equal(options.redirect,'error');assert.equal(options.headers.Authorization,'Bearer synthetic-google-key');return new Response(JSON.stringify({data:[{id:'gemini-3.8-flash'},{id:'other'}]}));});assert.deepEqual((await (await send('/v1/models')).json()).data,[{id:'gemini-3.8-flash'}]);});
test('forwards valid SSE without buffering',async t=>{const send=await fixture(t,()=>new Response('data: {"choices":[]}\n\ndata: [DONE]\n\n'));const response=await send('/v1/chat/completions',{method:'POST',body:JSON.stringify({model:'gemini-3.8-flash',messages:[{role:'user',content:'synthetic'}],stream:true})});assert.equal(response.headers.get('content-type'),'text/event-stream');assert.match(await response.text(),/DONE/);});
test('upstream rejection cannot echo credentials',async t=>{const send=await fixture(t,()=>new Response('synthetic-google-key',{status:401}));const response=await send('/v1/models');assert.equal(response.status,401);assert.equal((await response.text()).includes('synthetic-google-key'),false);});


const body = JSON.stringify({ model: 'gemini-3.8-flash', messages: [{ role: 'user', content: 'synthetic' }], stream: true });
const frame = value => new TextEncoder().encode(`data: ${value}\n\n`);
const models = () => new Response(JSON.stringify({ data: [{ id: 'gemini-3.8-flash' }] }));
const clientRequest = send => {
  const req = http.request(`${send.origin}/v1/chat/completions`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  // Every raw client has a bounded wait and teardown; incomplete upload is intentional.
  req.on('error', () => {});
  req.setTimeout(2000, () => req.destroy(new Error('synthetic client guard timeout')));
  return req;
};
const waitClosed = req => new Promise(resolve => req.once('close', resolve));
const bounded = async promise => {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('synthetic fixture did not settle')), 1500);
    timer.unref();
  })]); } finally { clearTimeout(timer); }
};

test('server timeout closes unfinished uploads and recovers the occupied concurrency slot', { timeout: 4000 }, async t => {
  let upstreamCalls = 0;
  const send = await fixture(t, () => { upstreamCalls++; return models(); }, { timeoutMs: 150, maxConcurrent: 1 });
  const incoming = once(send.server, 'request');
  const req = clientRequest(send); t.after(() => req.destroy());
  const closed = waitClosed(req);
  const started = performance.now();
  req.write('{"model":');
  const [serverRequest] = await incoming;
  assert.equal((await send('/v1/models')).status, 429);
  await bounded(closed);
  assert.ok(performance.now() - started < 1200, 'server deadline, not the 2s client guard, must close upload');
  assert.equal(serverRequest.destroyed, true);
  assert.equal(serverRequest.complete, false);
  assert.equal(upstreamCalls, 0);
  assert.equal((await send('/v1/models')).status, 200);
  assert.equal(upstreamCalls, 1);
});

test('client cancellation of an unfinished upload releases the slot without an upstream call', { timeout: 4000 }, async t => {
  let upstreamCalls = 0;
  const send = await fixture(t, () => { upstreamCalls++; return models(); }, { timeoutMs: 3000, maxConcurrent: 1 });
  const incoming = once(send.server, 'request');
  const req = clientRequest(send); t.after(() => req.destroy());
  const closed = waitClosed(req);
  req.write('{');
  const [serverRequest] = await incoming;
  const serverClosed = new Promise(resolve => serverRequest.once('close', resolve));
  assert.equal((await send('/v1/models')).status, 429);
  req.destroy();
  await bounded(Promise.all([closed, serverClosed]));
  assert.equal(serverRequest.aborted, true);
  assert.equal(upstreamCalls, 0);
  assert.equal((await send('/v1/models')).status, 200);
});

test('upstream response timeout aborts the upstream and frees the slot with a safe 504', { timeout: 4000 }, async t => {
  let upstreamAborted = false; let calls = 0;
  const send = await fixture(t, (_url, options) => {
    if (++calls > 1) return models();
    return new Promise((_, reject) => options.signal.addEventListener('abort', () => {
      upstreamAborted = true; reject(new Error('synthetic upstream secret must not leak'));
    }, { once: true }));
  }, { timeoutMs: 100, maxConcurrent: 1 });
  const response = await send('/v1/models');
  assert.equal(response.status, 504);
  assert.deepEqual(await response.json(), { error: { code: 'UPSTREAM_UNAVAILABLE' } });
  assert.equal(upstreamAborted, true);
  assert.equal((await send('/v1/models')).status, 200);
});

test('delivers the first SSE frame over HTTP before upstream EOF', { timeout: 4000 }, async t => {
  let controller; let upstreamEnded = false;
  const send = await fixture(t, () => new Response(new ReadableStream({ start(c) {
    controller = c; c.enqueue(frame('{"choices":[{"delta":{"content":"first"}}]}'));
  } })));
  const response = await send('/v1/chat/completions', { method: 'POST', body });
  const reader = response.body.getReader();
  const first = await bounded(reader.read());
  assert.equal(first.done, false);
  assert.match(new TextDecoder().decode(first.value), /first/);
  assert.equal(upstreamEnded, false);
  assert.equal(response.headers.get('x-accel-buffering'), 'no');
  controller.enqueue(frame('[DONE]')); upstreamEnded = true; controller.close();
  let rest = ''; for (;;) { const chunk = await reader.read(); if (chunk.done) break; rest += new TextDecoder().decode(chunk.value); }
  assert.match(rest, /\[DONE\]/);
});

test('upstream midstream failure terminates the client stream without a false DONE and recovers the slot', { timeout: 4000 }, async t => {
  let controller; let calls = 0;
  const send = await fixture(t, () => ++calls > 1 ? models() : new Response(new ReadableStream({ start(c) {
    controller = c; c.enqueue(frame('{"choices":[{"delta":{"content":"partial"}}]}'));
  } })), { maxConcurrent: 1 });
  const response = await send('/v1/chat/completions', { method: 'POST', body });
  const reader = response.body.getReader();
  const first = new TextDecoder().decode((await reader.read()).value);
  assert.match(first, /partial/); assert.doesNotMatch(first, /DONE/);
  controller.error(new Error('synthetic upstream failure'));
  await bounded(assert.rejects(reader.read()));
  assert.equal((await send('/v1/models')).status, 200);
});

test('deadline cancels a stalled SSE upstream and closes the client stream before releasing the slot', { timeout: 4000 }, async t => {
  let cancelled = false; let upstreamSignal; let calls = 0;
  const send = await fixture(t, (_url, options) => {
    if (++calls > 1) return models();
    upstreamSignal = options.signal;
    return new Response(new ReadableStream({ start(c) { c.enqueue(frame('partial')); }, cancel() { cancelled = true; } }));
  }, { timeoutMs: 150, maxConcurrent: 1 });
  const response = await send('/v1/chat/completions', { method: 'POST', body });
  const reader = response.body.getReader();
  assert.equal(new TextDecoder().decode((await reader.read()).value), 'data: partial\n\n');
  await bounded(assert.rejects(reader.read()));
  assert.equal(upstreamSignal.aborted, true); assert.equal(cancelled, true);
  assert.equal((await send('/v1/models')).status, 200);
});

test('client cancellation of SSE aborts the upstream and restores the slot', { timeout: 4000 }, async t => {
  let signal; let cancelledResolve;
  const cancelled = new Promise(resolve => { cancelledResolve = resolve; });
  let calls = 0;
  const send = await fixture(t, (_url, options) => {
    if (++calls > 1) return models();
    signal = options.signal;
    return new Response(new ReadableStream({ start(c) { c.enqueue(frame('first')); }, cancel() { cancelledResolve(); } }));
  }, { timeoutMs: 3000, maxConcurrent: 1 });
  const clientAbort = new AbortController();
  const response = await send('/v1/chat/completions', { method: 'POST', body, signal: clientAbort.signal });
  const reader = response.body.getReader(); await reader.read();
  clientAbort.abort();
  await assert.rejects(reader.read());
  await bounded(cancelled);
  assert.equal(signal.aborted, true);
  assert.equal((await send('/v1/models')).status, 200);
});

test('rejects a fully uploaded oversized body without using upstream or retaining its slot', { timeout: 4000 }, async t => {
  let upstreamCalls = 0;
  const send = await fixture(t, () => { upstreamCalls++; return models(); }, { maxBytes: 8, maxConcurrent: 1 });
  const response = await send('/v1/chat/completions', { method: 'POST', body });
  assert.equal(response.status, 413); assert.deepEqual(await response.json(), { error: { code: 'BODY_TOO_LARGE' } });
  assert.equal(upstreamCalls, 0);
  assert.equal((await send('/v1/models')).status, 200);
});
