import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const html=readFileSync('index.html','utf8');

test('first-paint placeholders keep the real chart and dashboard geometry',()=>{
 for(const id of ['chart','energyChart'])assert.ok(html.includes(`id="${id}" class="chart"><div class="plate-skeleton sk-chart" aria-hidden="true">`));
 assert.match(html,/height=202/);
 assert.match(html,/\.sk-chart\{height:202px/);
 const dash=html.slice(html.indexOf('id="budgetDashboard"'),html.indexOf('id="foodListCard"'));
 for(const key of ['protein','fibre','energy','plate'])assert.ok(dash.includes(`class="budget-mini" data-metric="${key}"`));
 assert.match(dash,/class="macro-budget sk-block"/);
 assert.match(dash,/class="reserve-label"/);
 assert.match(html,/prefers-reduced-motion:reduce[^\n]*\.sk-weight\{animation:none/);
 assert.doesNotMatch(html,/btnState\(\);render\(\);status\("Loading/);
});

test('initial timeout leaves a static placeholder and a retry which clears loading on success',async()=>{
 const nodes=new Map();
 const $=id=>{if(!nodes.has(id))nodes.set(id,{dataset:{},setAttribute(k,v){this[k]=v}});return nodes.get(id)};
 let call=0;
 const refresh=async signal=>{assert.ok(signal);if(++call===1)throw Object.assign(Error('late'),{name:'TimeoutError'})};
 const source=html.slice(html.indexOf('let initialScreenChosen='),html.indexOf('btnState();loadPlate();'));
 runInNewContext(source,{$,refresh,restoreGuide(){},firstMealGuide:null,AbortSignal,location:{hash:""},state:{food:[{}]}});
 const retry=$('#plateLoadRetry').onclick,main=$('#plateMain');
 await retry();
 assert.equal(main.dataset.load,'error');
 assert.equal(main['aria-busy'],'false');
 assert.equal($('#plateLoadError').hidden,false);
 assert.match($('#plateLoadErrorText').textContent,/too long/);
 await retry();
 assert.equal(main.dataset.load,undefined);
 assert.equal(main['aria-busy'],'false');
 assert.equal($('#plateLoadError').hidden,true);
 assert.equal($('#plateLoadStatus').textContent,'');
});

test('all controls touched before the first load exist in the page',()=>{
 const nodes=new Map();
 const $=selector=>{
  if(!nodes.has(selector)){
   const id=/^#([\w-]+)/.exec(selector)?.[1];
   assert.ok(id && html.includes('id="'+id+'"'),selector+' is missing from the markup');
   nodes.set(selector,{});
  }
  return nodes.get(selector);
 };
 const code=html.slice(html.indexOf('function btnState(){'),html.indexOf('async function api('));
 for(const ready of [false,true]){
  const context={$,ready,busy:false,importEntries:[],document:{querySelectorAll:()=>[]},updateTodayButton(){},chatImportButtons(){}};
  runInNewContext(code+';btnState()',context);
  assert.equal($('#openLog').disabled,!ready);
 }
});

test('mobile entry controls avoid automatic focus zoom without disabling pinch zoom',()=>{
 assert.match(html,/@media \(any-pointer:coarse\),\(max-width:600px\)\{\s*#plateMain :is\(input,select,textarea\)\{font-size:max\(16px,1rem\)\}/);
 const viewport=html.match(/<meta name="viewport"[^>]+>/)?.[0];
 assert.ok(viewport);
 assert.doesNotMatch(viewport,/user-scalable|maximum-scale/);
});
