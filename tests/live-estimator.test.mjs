import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {Script} from 'node:vm';
import {DatabaseSync} from 'node:sqlite';
const origin='https://plate.example.test';
const owner='synthetic-owner';
const hash=s=>createHash('sha256').update(s).digest('hex');
test('compiled estimator gates identity, expiry, role quotas and administration; private logs stay isolated',async()=>{
 execFileSync(process.execPath,['build.mjs'],{stdio:'ignore'});
 const src=readFileSync('dist/server/index.js','utf8');
 let calls=0;
 const originalFetch=globalThis.fetch;
 globalThis.fetch=async function(url,settings){
  assert.equal(this,globalThis);
  assert.equal(settings.redirect,'manual');
  calls++;
  assert.equal(url,'https://api.openai.com/v1/responses');
  const body=JSON.parse(settings.body);
  assert.equal(body.store,false);
  assert.deepEqual(body.input[0].content,[{type:'input_text',text:'Fictional apple'}]);
  return Response.json({status:'completed',output:[{type:'message',role:'assistant',content:[{type:'output_text',text:JSON.stringify({entries:[{description:'Apple, estimated 150 g',kj:330,macros:{fibre_g:3},groups:{fruit:330}}]})}]}]});
 };
 let worker;
 ({default:worker}=await import('data:text/javascript;base64,'+Buffer.from(src).toString('base64')));
 const db=new DatabaseSync(':memory:');
 for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort()) db.exec(readFileSync('drizzle/'+f,'utf8'));
 const adapter={batch:async statements=>Promise.all(statements.map(st=>st.all())),prepare:sql=>{
   const statement=db.prepare(sql);
   const bind=(...args)=>({first:async()=>statement.get(...args)??null,run:async()=>({meta:statement.run(...args)}),all:async()=>({results:statement.all(...args)})});
   return {...bind(),bind};
 }};
 const config={DB:adapter,PLATE_ORIGIN:origin,PLATE_OWNER_SHA256:hash(owner),OPENAI_API_KEY:'local-test-secret',PLATE_ESTIMATE_ENABLED:'true',PLATE_ESTIMATE_END_UTC:'2099-01-01T00:00:00Z'};
 const get=(id,url=origin)=>new Request(url,{headers:id?{'oai-authenticated-user-id':id,...id==='different-user'&&{'oai-authenticated-user-email':'guest@example.test'}}:{}});
 const send=(id,formOrigin=origin)=>new Request(origin+'/api/estimate-meal',{method:'POST',headers:{...id&&{'oai-authenticated-user-id':id},origin:formOrigin,'sec-fetch-site':'same-origin','content-type':'application/json'},body:JSON.stringify({kind:'text',text:'Fictional apple'})});
 try{
  for(const id of [null,'different-user']){
   assert.equal((await worker.fetch(send(id),config)).status,404);
   const shell=await worker.fetch(get(id),config);
   const body=await shell.text();
   if(!id)assert.doesNotMatch(body,/<body data-native-estimate|local-test-secret/);
   else assert.match(body,/<body data-native-estimate data-native-composer>/);
  }
  for(const env of [{...config,OPENAI_API_KEY:undefined},{...config,PLATE_ESTIMATE_ENABLED:'false'},{...config,PLATE_ESTIMATE_END_UTC:'2025-01-01T00:00:00Z'}]){
   assert.equal((await worker.fetch(send(owner),env)).status,404);
   assert.doesNotMatch(await (await worker.fetch(get(owner),env)).text(),/<body data-native-estimate(?: |(?=>))/);
  }
  const shell=await worker.fetch(get(owner),config);
  const html=await shell.text();
  assert.match(html,/<body data-native-estimate(?: |(?=>))/);
  assert.match(html,/Log food in ChatGPT/);
  assert.doesNotMatch(html,/local-test-secret/);
  for(const [,js] of html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)){
   assert.doesNotThrow(()=>new Script(js));
   assert.ok(shell.headers.get('content-security-policy').includes(createHash('sha256').update(js).digest('base64')));
  }
  assert.equal((await worker.fetch(send(owner,'https://other.example'),config)).status,403);
  assert.equal(calls,0);
  for(let i=0;i<60;i++)assert.equal((await worker.fetch(send(owner),config)).status,200);
  assert.equal((await worker.fetch(send(owner),config)).status,429);
  assert.equal(calls,60);
  const app=(id,path,body,requestOrigin=origin,preview)=>worker.fetch(new Request(origin+path,{
   method:body?'POST':'GET',
   headers:{...id&&{'oai-authenticated-user-id':id},...preview&&{'x-plate-onboarding-preview':preview},...body&&{origin:requestOrigin,'sec-fetch-site':'same-origin','content-type':'application/json'}},
   ...body&&{body:JSON.stringify(body)},
  }),config);
  const guests=['guest-a','guest-b','guest-c','guest-d'];
  const ids={};
  for(const guest of guests){
   const html=await (await app(guest,'/')).text();
   assert.doesNotMatch(html,/<body[^>]*data-plate-admin/);
   ids[guest]=html.match(/data-plate-account="([0-9a-f-]{36})"/)?.[1];
   assert.ok(ids[guest]);
  }
  for (const guest of guests.slice(0,3)){
   for(let i=0;i<10;i++)assert.equal((await worker.fetch(send(guest),config)).status,200);
   assert.equal((await worker.fetch(send(guest),config)).status,429);
  }
  assert.equal((await worker.fetch(send('guest-d'),config)).status,429);
  assert.equal(calls,90);
  const admin='/api/admin/accounts';
  assert.equal((await app(null,admin)).status,404);
  assert.equal((await app('guest-a',admin)).status,404);
  assert.equal((await app('guest-a',admin,{id:ids['guest-a'],role:'trusted'})).status,404);
  const list=await (await app(owner,admin)).json();
  assert.deepEqual(list.accounts.map(a=>Object.keys(a)).flat().filter(x=>x==='account_id'),[]);
  assert.equal(list.accounts.length,5);
  assert.equal(list.accounts.filter(account=>account.email).at(0)?.email,'guest@example.test');
  const limits=admin+'/limits';
  assert.equal((await app('guest-a',limits)).status,404);
  assert.equal((await app('guest-a',limits,{standard_daily:1,shared_daily:20,trusted_daily:63})).status,404);
  assert.deepEqual((await (await app(owner,limits)).json()).policy,{standard_daily:10,shared_daily:30,trusted_daily:60});
  assert.equal((await app(owner,admin,{id:ids['guest-d'],role:'trusted'},'https://other.example')).status,403);
  assert.equal((await app(owner,admin,{id:ids['guest-d'],role:'trusted'})).status,200);
  for(let i=0;i<60;i++)assert.equal((await worker.fetch(send('guest-d'),config)).status,200);
  assert.equal((await worker.fetch(send('guest-d'),config)).status,429);
  assert.equal(calls,150);
  assert.equal(db.prepare('SELECT COUNT(*) AS total FROM food_entries').get().total,0);
  const day='2026-11-26';
  assert.equal((await app(owner,'/api/food',{day,description:'Owner only',kcal:250})).status,200);
  assert.equal((await app('guest-a','/api/food',{day,description:'Guest only',kcal:200})).status,200);
  assert.equal((await app('guest-a','/api/weight',{day,kg:84.8})).status,200);
  const onlyOwner=await (await app(owner,'/api/state')).json();
  const onlyGuest=await (await app('guest-a','/api/state')).json();
  assert.deepEqual(onlyOwner.food.map(row=>row.description),['Owner only']);
  assert.deepEqual(onlyOwner.weights,[]);
  assert.deepEqual(onlyGuest.food.map(row=>row.description),['Guest only']);
  assert.deepEqual(onlyGuest.weights,[{day,kg:84.8}]);
  const preview='9d448a3b-50f9-4205-ac73-0bb3e4903517';
  const sample=await (await app(owner,'/?onboarding-preview='+preview)).text();
  assert.match(sample,new RegExp('data-plate-onboarding="'+preview+'"'));
  assert.doesNotMatch(sample,/<body[^>]*data-plate-admin/);
  assert.doesNotMatch(sample,/id="onboardingPreviewNote" class="onboarding-preview-note" hidden/);
  const previewBefore=await (await app(owner,'/api/state',undefined,origin,preview)).json();
  assert.equal(previewBefore.food.length,0);assert.equal(previewBefore.weights.length,0);
  assert.equal((await app(owner,'/api/food',{day,description:'Preview only',kcal:100},origin,preview)).status,200);
  assert.equal((await app(owner,'/api/weight',{day,kg:79},origin,preview)).status,200);
  assert.equal((await app('guest-a','/api/state',undefined,origin,preview)).status,404);
  assert.equal((await app(owner,'/api/admin/accounts',undefined,origin,preview)).status,404);
  const previewAfter=await (await app(owner,'/api/state',undefined,origin,preview)).json();
  assert.deepEqual(previewAfter.food.map(row=>row.description),['Preview only']);
  assert.deepEqual(previewAfter.weights,[{day,kg:79}]);
  const liveAfterPreview=await (await app(owner,'/api/state')).json();
  assert.deepEqual(liveAfterPreview.food.map(row=>row.description),['Owner only']);
  assert.deepEqual(liveAfterPreview.weights,[]);
  assert.equal((await app(owner,admin,{id:ids['guest-a'],role:'blocked'})).status,200);
  assert.equal((await app('guest-a','/')).status,403);
  assert.equal((await app('guest-a','/api/state')).status,403);
  assert.equal((await app('guest-a','/api/weight',{day,kg:84.9})).status,403);
  assert.equal((await worker.fetch(send('guest-a'),config)).status,403);
  assert.equal((await app(owner,admin,{id:ids['guest-a'],role:'standard'})).status,200);
  assert.equal((await app('guest-a','/api/state')).status,200);
  assert.equal((await app(owner,limits,{standard_daily:24,shared_daily:20,trusted_daily:63})).status,400);
  assert.equal((await app(owner,limits,{standard_daily:10,shared_daily:31,trusted_daily:61})).status,200);
  assert.equal((await worker.fetch(send('guest-d'),config)).status,200);
  assert.equal((await worker.fetch(send('guest-d'),config)).status,429);
  assert.equal((await worker.fetch(send('different-user'),config)).status,200);
  assert.equal((await worker.fetch(send('different-user'),config)).status,429);
 }finally{db.close();globalThis.fetch=originalFetch;}
});

test('published composer uses one explicit browser mic click and one meal submit without a checkbox',()=>{
 const markup=readFileSync('estimate/native-meal.html','utf8');
 const js=readFileSync('estimate/native-meal.mjs','utf8');
 assert.doesNotMatch(markup,/checkbox|nativeUseOnlineVoice/);
 assert.doesNotMatch(markup,/nativeEstimateNotice|online speech service/);
 assert.match(js,/mic\.onclick=\(\)=>\{[\s\S]*?createBrowserRecognition\(recognitionType\(\),true\)[\s\S]*?startRecognition\(current,recognition\)/);
 assert.match(js,/try\{recognition\.start\(\)\}/);
 assert.doesNotMatch(js,/checkbox|await findLocalRecognition/);
 assert.match(markup,/rows="1"/);
 assert.doesNotMatch(markup,/Enter manually|Log food in ChatGPT/);
 assert.match(markup,/<div class="native-toolbar">[\s\S]*?id="nativePhotoChoices"[\s\S]*?aria-label="Take photo"[\s\S]*?aria-label="Choose from photo library"[\s\S]*?id="nativeMic"/);
 assert.doesNotMatch(markup,/>Take photo<|>Choose photo</);
 assert.doesNotMatch(js,/say\('Listening|say\('Starting browser dictation/);
 assert.match(markup,/id="nativeMicStatus" class="track-tile-sr"/);
});
test('provider failure is classified without logging raw key material or meal content',async()=>{
 const {createMealEstimateRoute}=await import('../estimate/meal-estimate-route.mjs');
 const events=[], warn=console.warn;
 console.warn=(...args)=>events.push(args);
 try{
  const req=()=>new Request(origin+'/api/estimate-meal',{method:'POST',headers:{origin,'sec-fetch-site':'same-origin','content-type':'application/json'},body:JSON.stringify({kind:'text',text:'Private meal description'})});
  const env={PLATE_ESTIMATE_ENABLED:'true',PLATE_ESTIMATE_TRIAL_ACCOUNT:owner,PLATE_ESTIMATE_DAILY_LIMIT:'5',ESTIMATE_LIMIT_DB:{},OPENAI_API_KEY:'test-credential\n'};
  const make=opts=>createMealEstimateRoute({trustedAccount:()=>owner,claim:()=>true,...opts});
  const rejected=await make({fetchImpl:async(_url,opts)=>{
    assert.equal(opts.headers.Authorization,'Bearer test-credential');
    return Response.json({error:{code:'invalid_api_key',message:'Raw provider body with secret'}},{status:401});
  }})(req(),env);
  assert.equal(rejected.status,502);
  assert.match((await rejected.json()).error,/didn’t accept/);
  const unreachable=await make({fetchImpl:async()=>{throw Error('Unexpected runtime header with secret')}})(req(),env);
  assert.match((await unreachable.json()).error,/couldn’t reach/);
  assert.deepEqual(events,[['plate-estimate','key',401,'invalid_api_key'],['plate-estimate','transport',null,null]]);
 }finally{console.warn=warn}
});
