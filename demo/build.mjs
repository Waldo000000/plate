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
  .replace('</body>', `<script>
const query=new URLSearchParams(location.search), shot=query.get('shot');
document.addEventListener('click',event=>{
  const action=event.target.closest('#plateStarter,#startFoodChat,#logMenuChat,.food-log-chat');
  if(!action)return;
  event.preventDefault();event.stopImmediatePropagation();
  document.querySelector('#logActionMenu').hidden=true;
  document.querySelector('#openLog').setAttribute('aria-expanded','false');
  location.hash=window.demoMealFragment;
},true);
document.querySelector('#logMenuChat').textContent='Review a sample meal';
if(query.has("capture")||self!==top)document.documentElement.style.scrollbarWidth="none";
if(shot)window.addEventListener('load',()=>{
  const ready=new MutationObserver(prepare);
  function prepare(){
    const macros=document.querySelector('#weightMacrosToggle');
    if(macros.disabled)return;
    ready.disconnect();
    if(shot==='track'||shot?.startsWith('track-')){
      const targets=document.querySelector('#trackTargetsToggle');
      if((macros.getAttribute('aria-pressed')==='true')!==(shot!=='track-fibre'))macros.click();
      if((targets.getAttribute('aria-pressed')==='true')!==(shot==='track-fibre'||shot==='track'))targets.click();
      document.querySelector('[data-range="all"]').click();
    }
    if(shot==='weight'){
      document.querySelector('#trackTargetsToggle').click();
      document.querySelector('[data-range="all"]').click();
    }
    if(shot==='high-energy'){
      const picker=document.querySelector('#day');
      picker.value=new Date(Date.parse(picker.value)-5*86400000).toISOString().slice(0,10);
      picker.dispatchEvent(new Event('change'));
      renderFoodTray(true);
      document.querySelector('#foodList [aria-label^="Sort food by energy"]')?.click();
      document.activeElement?.blur();
    }
    if(query.has('capture')){
      const selector=shot==='high-energy'?'#foodListCard':shot==='next-meal'?'[aria-label="Daily log"]':'.shared-history-card';
      requestAnimationFrame(()=>document.querySelector(selector)?.scrollIntoView({block:'center',behavior:'instant'}));
    }
  }
  ready.observe(document.querySelector('#weightMacrosToggle'),{attributes:true,attributeFilter:['disabled']});
  prepare();
});
</script></body>`)
  .replace(/<body[^>]*>/, '$&<div class="demo-disclaimer">Interactive demo · fictional data · changes reset on reload</div>');
const dest = new URL('./dist/', import.meta.url);
mkdirSync(dest, {recursive:true});
writeFileSync(new URL('index.html', dest), demo);
writeFileSync(new URL('capture.html', dest), `<!doctype html><meta charset="utf-8"><title>Plate mobile views</title>
<style>body{margin:0;padding:0;background:#eaece7;display:grid;place-items:center}iframe{display:block;width:408px;height:844px;border:0}</style>
<iframe title="Plate at a mobile viewport" src="./?capture=1"></iframe><script>
const params=new URLSearchParams(location.search); params.set('capture','1'); document.querySelector('iframe').src='./?'+params;
</script>`);
console.log('Built demo/dist/index.html');
