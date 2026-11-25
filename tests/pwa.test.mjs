import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
execFileSync(process.execPath,['build.mjs']);
const {default:worker}=await import('../dist/server/index.js');
const request=(path,opts)=>worker.fetch(new Request('https://plate.example'+path,opts),{});
test('both Plate pages link the same installable app identity without changing API authentication',async()=>{
 for(const auth of [undefined,{'oai-authenticated-user-id':'synthetic-test-account'}]){
  const response=await request('/',{headers:auth});
  assert.equal(response.status,200);
  assert.match(await response.text(),/rel="manifest" href="\/manifest\.webmanifest"/);
  assert.match(response.headers.get('content-security-policy'),/manifest-src 'self'/);
  assert.match(response.headers.get('cache-control'),/private, no-store/);
 }
 assert.equal((await request('/api/state')).status,401);
 const response=await request('/manifest.webmanifest');
 assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/^application\/manifest\+json/);
 const manifest=await response.json();
 assert.deepEqual([manifest.id,manifest.start_url,manifest.scope,manifest.display,manifest.short_name],['/','/','/','standalone','Plate']);
 for(const {src,sizes,type} of manifest.icons){
  const icon=await request(src);
  assert.equal(icon.status,200);assert.equal(icon.headers.get('content-type'),type);
  const bytes=Buffer.from(await icon.arrayBuffer());
  assert.equal(bytes.subarray(1,4).toString(),'PNG');
  assert.equal(bytes.readUInt32BE(16)+'x'+bytes.readUInt32BE(20),sizes);
  const head=await request(src,{method:'HEAD'});assert.equal(head.status,200);assert.equal(await head.text(),'');
 }
 assert.equal((await request('/manifest.webmanifest',{method:'POST'})).status,404);
});
