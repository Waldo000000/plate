import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const html=readFileSync('index.html','utf8');
const source=html.slice(html.indexOf('const historyScope='),html.indexOf('$("#day").value=today();'));
function boot(key,store){
 const make=dataset=>({dataset,setAttribute(k,v){this[k]=v}});
 const buttons=['30','6m','all'].map(range=>make({range}));
 const dom=Object.fromEntries(['#weightMacrosToggle','#trackTargetsToggle','#weightMacrosDetails'].map(id=>[id,make()]));
 const context={document:{documentElement:{dataset:{historyScope:key}},querySelectorAll:()=>buttons},
  $:id=>dom[id],localStorage:store,chartRange:'30',weightMacrosVisible:false,trackTargetsVisible:true};
 runInNewContext(source+';globalThis.persist=saveHistoryView;',context);
 return context;
}
test('retains browser preferences independently for each opaque account scope',()=>{
 const m=new Map(),store={getItem:k=>m.get(k),setItem:(k,v)=>m.set(k,v)};
 const a=boot('a',store);
 a.persist({range:'all'});a.persist({macros:true});a.persist({targets:false});
 const re=boot('a',store),b=boot('b',store);
 assert.deepEqual([re.chartRange,re.weightMacrosVisible,re.trackTargetsVisible],['all',true,false]);
 assert.deepEqual([b.chartRange,b.weightMacrosVisible,b.trackTargetsVisible],['30',false,true]);
});
test('blocked and malformed local storage leave defaults without throwing',()=>{
 for(const store of [{getItem:()=>'{broken'},{getItem:()=>'{"range":"unsupported","macros":"false","targets":null}'},
  {getItem(){throw Error()},setItem(){throw Error()}}]){
  const x=boot('a',store);
  assert.deepEqual([x.chartRange,x.weightMacrosVisible,x.trackTargetsVisible],['30',false,true]);
  x.persist({range:'6m'});
 }
});
