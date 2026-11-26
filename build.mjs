import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
const sourceHtml = readFileSync('index.html', 'utf8');
const marker = '<!-- WEIGHT_IMPORT_PARSER -->';
const weightImporter = readFileSync('weight-import.js', 'utf8');
if (sourceHtml.split(marker).length !== 2 || /<\/script[\s>]/i.test(weightImporter)) {
  throw new Error('Weight importer needs one safe inline script insertion point.');
}
const strip = source => source.replace(/^import .*?;\n/gm,'').replace(/^export /gm,'');
const estimatorModule = names => names.map(name=>strip(readFileSync('estimate/'+name,'utf8'))).join('\n');
const clientEstimator=estimatorModule(['meal-estimate.mjs','native-mic.mjs','same-origin-provider.mjs','composer-input.mjs','photo-input.mjs','native-meal.mjs','plate-admin.mjs']);
const writeLoop=sourceHtml.match(/  while\(draft\.pending\.length\)\{[\s\S]*?\n  \}/)?.[0];
if(!writeLoop || /<\/script[\s>]/i.test(clientEstimator))throw Error('Missing Plate estimator integration point');
const html = sourceHtml.replace(marker, () => '<script>\n' + weightImporter + '\n</script>')
 .replace(writeLoop,'  await writeFoodDraft(draft);')
 .replace('chatSave.onclick=async()=>{','async function writeFoodDraft(draft){\n'+writeLoop+'\n}\nchatSave.onclick=async()=>{')
 .replace('<div id="chatSteps">',readFileSync('estimate/native-meal.html','utf8')+'<div id="chatSteps">')
 .replace('</head>','<style>'+readFileSync('estimate/native-meal.css','utf8')+'</style></head>')
 .replace('</body>',()=>'<script>\n(()=>{\n'+clientEstimator+'\n})();\n</script></body>');
const serverEstimator='const plateEstimateRoute=(()=>{\n'+estimatorModule(['meal-estimate.mjs','photo-png.mjs','meal-estimate-route.mjs'])+'\nreturn createMealEstimateRoute({trustedAccount:request=>request.headers.get("oai-authenticated-user-id"),timeoutMs:22_000,sanitizePhoto:sanitizeCanvasPng});\n})();';
const backend = readFileSync('backend.js', 'utf8')+'\n'+readFileSync('estimate/access-control.mjs','utf8');
const welcome = readFileSync('welcome.html','utf8');
const hashes = tag => [...(html+welcome).matchAll(new RegExp('<'+tag+'(?:\\s[^>]*)?>([\\s\\S]*?)</'+tag+'>','gi'))].map(x=>"'sha256-"+createHash('sha256').update(x[1]).digest('base64')+"'");
const csp = "default-src 'none'; script-src "+hashes('script').join(' ')+"; style-src 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; manifest-src 'self'; connect-src 'self'; font-src 'self'; form-action 'self'; frame-ancestors 'self' https://chatgpt.com https://*.chatgpt.com; base-uri 'none'; object-src 'none'";
const publicAssets = Object.fromEntries([
  ['/manifest.webmanifest','pwa/manifest.webmanifest','application/manifest+json; charset=utf-8'],
  ['/icons/plate-192.png','pwa/plate-192.png','image/png'],
  ['/icons/plate-512.png','pwa/plate-512.png','image/png'],
].map(([url,path,type])=>[url,{type,base64:readFileSync(path).toString('base64')}]));
const glue = `
const siteDocument = ${JSON.stringify(html)};
const publicWelcome = ${JSON.stringify(welcome)};
const siteCsp = ${JSON.stringify(csp)};
const publicAssets = ${JSON.stringify(publicAssets)};
const estimateEnabled=(env, route, role)=>Boolean(role) &&
 route.origin===env?.PLATE_ORIGIN &&
 env?.PLATE_ESTIMATE_ENABLED==='true' && Boolean(env?.OPENAI_API_KEY?.trim()) && Boolean(env?.DB) &&
 Number.isFinite(Date.parse(env.PLATE_ESTIMATE_END_UTC)) && Date.now()<Date.parse(env.PLATE_ESTIMATE_END_UTC);
export default { async fetch(request, env) {
  const route = new URL(request.url);
  if(Object.hasOwn(publicAssets,route.pathname)&&['GET','HEAD'].includes(request.method)){
   const {type,base64}=publicAssets[route.pathname];
   const bytes=request.method==='HEAD'?null:Uint8Array.from(atob(base64),value=>value.charCodeAt(0));
   return new Response(bytes,{headers:{'content-type':type,'cache-control':'public, max-age=3600','x-content-type-options':'nosniff'}});
  }
  const candidate = request.headers.get('oai-authenticated-user-id');
  const identityHash = candidate ? await crypto.subtle.digest('SHA-256',new TextEncoder().encode(candidate)) : null;
  const isOwner = identityHash ? Array.from(new Uint8Array(identityHash),n=>n.toString(16).padStart(2,'0')).join('') === env?.PLATE_OWNER_SHA256 : false;
  const previewHeader=request.headers.get('x-plate-onboarding-preview');
  const previewQuery=route.pathname==='/'?route.searchParams.get('onboarding-preview'):null;
  const previewId=previewHeader??previewQuery;
  const previewRequested=previewId!==null;
  const validPreview=previewRequested&&/^[0-9a-f-]{36}$/.test(previewId);
  if(previewRequested&&(!validPreview||((!isOwner||route.pathname==='/mcp')&&previewHeader!==null)))return roleResponse({error:'Preview not available.'},404);
  const inPreview=validPreview&&isOwner;
  let previewAccount=null;
  if(inPreview){
   const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode('plate-onboarding:'+candidate+':'+previewId));
   previewAccount='plate-onboarding-v1:'+Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
  }
  if((route.pathname==='/api/admin/accounts'||route.pathname==='/api/admin/accounts/limits'))return plateAccountsAdmin(request,env?.DB,isOwner&&!inPreview);
  let profile=null;
  if(candidate && !isOwner && route.pathname!=='/mcp'){
   try{profile=await guestProfile(env?.DB,candidate,route.pathname==='/'&&request.method==='GET',request.headers.get('oai-authenticated-user-email'))}
   catch{return roleResponse({error:'Plate is temporarily unavailable.'},503)}
   if(profile?.role==='blocked'){
    if(route.pathname.startsWith('/api/'))return roleResponse({error:'This account no longer has access to Plate.'},403);
    if(route.pathname==='/')return new Response('This account no longer has access to Plate.',{status:403,headers:{'content-type':'text/plain;charset=UTF-8','cache-control':'private, no-store'}});
   }
  }
  const role=isOwner?'owner':profile?.role;
  // The connector remains owner-only even when signed-in guests use the dashboard.
  let dataRequest = request;
  if(inPreview&&route.pathname.startsWith('/api/')&&route.pathname!=='/api/estimate-meal'){
   const headers=new Headers(request.headers);
   headers.set('oai-authenticated-user-id',previewAccount);
   dataRequest=new Request(request,{headers});
  }
  if (candidate && !isOwner && (route.pathname==='/mcp' || (!role&&route.pathname.startsWith('/api/')))){
   const headers=new Headers(request.headers);
   headers.delete('oai-authenticated-user-id');
   dataRequest=new Request(request,{headers});
  }
  const canEstimate=estimateEnabled(env,route,role);
  if(route.pathname==='/api/estimate-meal'){
   if(!canEstimate)return new Response('Not found',{status:404,headers:{'cache-control':'private, no-store'}});
   let policy;
   try{policy=await plateQuotaPolicy(env.DB)}catch{return roleResponse({error:'Estimate limits are unavailable. Manual entry is in Settings.'},503)}
   return plateEstimateRoute(request,{PLATE_ESTIMATE_ENABLED:'true',PLATE_ESTIMATE_DAILY_LIMIT:role==='standard'?policy.standard_daily:policy.trusted_daily,PLATE_ESTIMATE_SHARED_LIMIT:policy.shared_daily,PLATE_ESTIMATE_STARTER:role==='standard',ESTIMATE_LIMIT_DB:env.DB,
    PLATE_ESTIMATE_TRIAL_ACCOUNT:candidate,OPENAI_API_KEY:env.OPENAI_API_KEY});
  }
  const data = await handleData(dataRequest, env);
  if (data) return data;
  if (route.pathname !== '/' || !['GET','HEAD'].includes(request.method)) return new Response('Not found', {status:404});
  let body=null;
  if(request.method==='GET'){
   const account=role ? (previewAccount??candidate) : null;
   if(!account)body=publicWelcome;
   else{
    // A site-specific opaque browser-storage namespace; neither the raw
    // account identifier nor view preferences are sent back to the server.
    const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode('plate-history-view-v1:'+account));
    const scope=Array.from(new Uint8Array(bytes),n=>n.toString(16).padStart(2,'0')).join('');
    body=siteDocument.replace('<body>','<body'+(canEstimate?' data-native-estimate':'')+(isOwner&&!inPreview?' data-plate-admin':'')+' data-native-composer>').replace('data-history-scope=""','data-history-scope="'+scope+'"');
    if(inPreview)body=body.replace('data-plate-onboarding=""','data-plate-onboarding="'+previewId+'"').replace('id="onboardingPreviewNote" class="onboarding-preview-note" hidden','id="onboardingPreviewNote" class="onboarding-preview-note"');
    if(profile)body=body.replace('data-plate-account=""','data-plate-account="'+profile.public_id+'"');
   }
  }
  return new Response(body, {headers:{'content-type':'text/html;charset=UTF-8','cache-control':'private, no-store','content-security-policy':siteCsp,'x-content-type-options':'nosniff','referrer-policy':'no-referrer'}});
}};
`;
mkdirSync('dist/server',{recursive:true});

writeFileSync('dist/server/index.js',backend+'\n'+serverEstimator+'\n'+glue);
if(existsSync('.openai/hosting.json')){
 mkdirSync('dist/.openai',{recursive:true});
 writeFileSync('dist/.openai/hosting.json',readFileSync('.openai/hosting.json'));
}
