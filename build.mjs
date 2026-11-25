import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
const sourceHtml = readFileSync('index.html', 'utf8');
const marker = '<!-- WEIGHT_IMPORT_PARSER -->';
const weightImporter = readFileSync('weight-import.js', 'utf8');
if (sourceHtml.split(marker).length !== 2 || /<\/script[\s>]/i.test(weightImporter)) {
  throw new Error('Weight importer needs one safe inline script insertion point.');
}
const html = sourceHtml.replace(marker, () => '<script>\n' + weightImporter + '\n</script>');
const backend = readFileSync('backend.js', 'utf8');
const welcome = readFileSync('welcome.html','utf8');
const hashes = tag => [...(html+welcome).matchAll(new RegExp('<'+tag+'(?:\\s[^>]*)?>([\\s\\S]*?)</'+tag+'>','gi'))].map(x=>"'sha256-"+createHash('sha256').update(x[1]).digest('base64')+"'");
const csp = "default-src 'none'; script-src "+hashes('script').join(' ')+"; style-src 'unsafe-inline'; img-src 'self' data:; manifest-src 'self'; connect-src 'self'; font-src 'self'; form-action 'self'; frame-ancestors 'self' https://chatgpt.com https://*.chatgpt.com; base-uri 'none'; object-src 'none'";
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
export default { async fetch(request, env) {
  const route = new URL(request.url);
  if(Object.hasOwn(publicAssets,route.pathname)&&['GET','HEAD'].includes(request.method)){
   const {type,base64}=publicAssets[route.pathname];
   const bytes=request.method==='HEAD'?null:Uint8Array.from(atob(base64),value=>value.charCodeAt(0));
   return new Response(bytes,{headers:{'content-type':type,'cache-control':'public, max-age=3600','x-content-type-options':'nosniff'}});
  }
  const data = await handleData(request, env);
  if (data) return data;
  if (route.pathname !== '/' || !['GET','HEAD'].includes(request.method)) return new Response('Not found', {status:404});
  let body=null;
  if(request.method==='GET'){
   const account=request.headers.get('oai-authenticated-user-id');
   if(!account)body=publicWelcome;
   else{
    // A site-specific opaque browser-storage namespace; neither the raw
    // account identifier nor view preferences are sent back to the server.
    const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode('plate-history-view-v1:'+account));
    const scope=Array.from(new Uint8Array(bytes),n=>n.toString(16).padStart(2,'0')).join('');
    body=siteDocument.replace('data-history-scope=""','data-history-scope="'+scope+'"');
   }
  }
  return new Response(body, {headers:{'content-type':'text/html;charset=UTF-8','cache-control':'private, no-store','content-security-policy':siteCsp,'x-content-type-options':'nosniff','referrer-policy':'no-referrer'}});
}};
`;
mkdirSync('dist/server',{recursive:true});
writeFileSync('dist/server/index.js',backend+'\n'+glue);
