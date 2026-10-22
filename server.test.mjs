import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createProxy } from './server.mjs';
const token = 'synthetic-only-proxy-token-at-least-32-chars';
async function fixture(t, upstream) {
 const server=createProxy({apiKey:'synthetic-google-key',proxyToken:token,fetchImpl:upstream});
 server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(resolve=>server.close(resolve)));
 return (path, options={})=>fetch(`http://127.0.0.1:${server.address().port}${path}`, { ...options, headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json',...options.headers} });
}
test('fails closed with missing credentials',()=>assert.throws(()=>createProxy({}),/Set GEMINI_API_KEY/));
test('auth rejects before contacting Google',async t=>{const send=await fixture(t,()=>assert.fail('network'));assert.equal((await send('/v1/models',{headers:{Authorization:'Bearer wrong'}})).status,401);});
test('rejects arbitrary proxy destinations and unknown routes',async t=>{const send=await fixture(t,()=>assert.fail('network'));assert.equal((await send('/v1/chat/completions',{method:'POST',body:JSON.stringify({model:'gemini-3.8-flash',messages:[{role:'user',content:'test'}],baseUrl:'http://169.254.169.254'})})).status,400);assert.equal((await send('/https://attacker.test')).status,404);});
test('lists only allowed models and uses server credentials with redirects blocked',async t=>{const send=await fixture(t,(url,options)=>{assert.equal(url,'https://generativelanguage.googleapis.com/v1beta/openai/models');assert.equal(options.redirect,'error');assert.equal(options.headers.Authorization,'Bearer synthetic-google-key');return new Response(JSON.stringify({data:[{id:'gemini-3.8-flash'},{id:'other'}]}));});assert.deepEqual((await (await send('/v1/models')).json()).data,[{id:'gemini-3.8-flash'}]);});
test('forwards valid SSE without buffering',async t=>{const send=await fixture(t,()=>new Response('data: {"choices":[]}\n\ndata: [DONE]\n\n'));const response=await send('/v1/chat/completions',{method:'POST',body:JSON.stringify({model:'gemini-3.8-flash',messages:[{role:'user',content:'synthetic'}],stream:true})});assert.equal(response.headers.get('content-type'),'text/event-stream');assert.match(await response.text(),/DONE/);});
test('upstream rejection cannot echo credentials',async t=>{const send=await fixture(t,()=>new Response('synthetic-google-key',{status:401}));const response=await send('/v1/models');assert.equal(response.status,401);assert.equal((await response.text()).includes('synthetic-google-key'),false);});
