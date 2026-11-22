import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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
const csp = "default-src 'none'; script-src "+hashes('script').join(' ')+"; style-src 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; form-action 'self'; frame-ancestors 'self' https://chatgpt.com https://*.chatgpt.com; base-uri 'none'; object-src 'none'";
const glue = `
const siteDocument = ${JSON.stringify(html)};
const publicWelcome = ${JSON.stringify(welcome)};
const siteCsp = ${JSON.stringify(csp)};
export default { async fetch(request, env) {
  const route = new URL(request.url);
  const data = await handleData(request, env);
  if (data) return data;
  if (route.pathname !== '/' || !['GET','HEAD'].includes(request.method)) return new Response('Not found', {status:404});
  return new Response(request.method === 'HEAD' ? null : (request.headers.get('oai-authenticated-user-id') ? siteDocument : publicWelcome), {headers:{'content-type':'text/html;charset=UTF-8','cache-control':'private, no-store','content-security-policy':siteCsp,'x-content-type-options':'nosniff','referrer-policy':'no-referrer'}});
}};
`;
mkdirSync('dist/server',{recursive:true});
writeFileSync('dist/server/index.js',backend+'\n'+glue);
if (existsSync('.openai/hosting.json')) {
  mkdirSync('dist/.openai',{recursive:true});
  writeFileSync('dist/.openai/hosting.json',readFileSync('.openai/hosting.json'));
}
