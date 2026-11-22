import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const input = read('../index.html');
const marker = '<!-- WEIGHT_IMPORT_PARSER -->';
if (input.split(marker).length !== 2) throw new Error('Missing Plate script insertion point');
const adapter = read('./fixture.js');
const importer = read('../weight-import.js');
if (/<\/script[\s>]/i.test(adapter + importer)) throw new Error('Invalid inline script');
const demo = input
  .replace(marker, () => '<script>\n' + adapter + '\n</script><script>\n' + importer + '\n</script>')
  .replace('<title>Plate</title>', '<title>Plate · Interactive demo</title>')
  .replace(/<(a|button)\b[^>]*id="plateStarter"[^>]*>[^<]*<\/\1>/i, '<button class="button chat-primary" type="button" id="plateStarter">Review a sample meal</button>')
  .replace(/<(a|button)\b[^>]*id="startFoodChat"[^>]*>[^<]*<\/\1>/i, '<button class="button chat-primary" type="button" id="startFoodChat">Review a sample meal</button>')
  .replace(/(href=")\/signout-with-chatgpt\?return_to=%2F"/i, '$1./"')
  .replace('Sign out of Plate', 'Reset demo')
  .replace('</head>', '<style>.demo-disclaimer{padding:8px 14px;background:#f0eadb;color:#604d27;text-align:center;font:650 .75rem system-ui;letter-spacing:.01em}</style><meta name="referrer" content="no-referrer"></head>')
  .replace('</body>', '<script>for(const id of ["plateStarter","startFoodChat"]){document.getElementById(id).onclick=()=>{location.hash=window.demoMealFragment;};}if(new URLSearchParams(location.search).has("capture") || window.self!==window.top)document.documentElement.style.scrollbarWidth="none";</script></body>')
  .replace(/<body[^>]*>/, '$&<div class="demo-disclaimer">Interactive demo · fictional data · changes reset on reload</div>');
const dest = new URL('./dist/', import.meta.url);
mkdirSync(dest, {recursive:true});
writeFileSync(new URL('index.html', dest), demo);
writeFileSync(new URL('capture.html', dest), `<!doctype html><meta charset="utf-8"><title>Plate mobile views</title>
<style>body{margin:0;padding:0;background:#eaece7;display:grid;place-items:center}iframe{display:block;width:390px;height:844px;border:0}</style>
<iframe title="Plate at a mobile viewport" src="./?capture=1"></iframe><script>
if(new URLSearchParams(location.search).has('example'))document.querySelector('iframe').src='./?capture=1&example=1';
</script>`);
console.log('Built demo/dist/index.html');
