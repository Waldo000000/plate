import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const h=readFileSync('index.html','utf8');
const code=h.slice(h.indexOf("const consumedClockFormat="),h.indexOf('function foodDisplayName('));
const ctx={toKj:f=>f.kcal*4.184};runInNewContext(code+';globalThis.sort=sortedFoods;globalThis.clock=consumedClockValue;globalThis.stamp=consumedAtOnDay;',ctx);
const rows=[{id:'z',kcal:100},{id:'b',kcal:200,created_at:'2026-11-19T03:00:00Z'},{id:'a',kcal:200,created_at:'2026-11-19T01:00:00Z'},{id:'c',kcal:50,created_at:'invalid'}];
test('time is earliest first, missing last; energy descending with stable ties',()=>{
 assert.equal(ctx.sort(rows,'time').map(f=>f.id).join(','),'a,b,c,z');
 assert.equal(ctx.sort(rows,'energy').map(f=>f.id).join(','),'a,b,z,c');
 assert.equal(rows[0].id,'z');
});
test('both sort modes keep energy bars, explicit missing time and expanded entry state',()=>{
 const render=h.slice(h.indexOf('function drawFoodList('),h.indexOf('let chartIndex='));
 assert.match(render,/for\(const f of sortedFoods\(items\)\)/);
 assert.match(render,/food-row-track/);assert.match(render,/Time not recorded/);
 assert.match(render,/details.open=openFoodEntries.has\(f.id\)/);
 assert.match(h,/food-grid\[data-sort=time\] .food-time/);
 assert.match(h,/food-grid\[data-sort=energy\] .food-energy/);
 assert.match(h,/button.dataset.foodSort=mode/);
});

test('known consumption time outranks entry time, and Brisbane time round trips',()=>{
 const coffee={id:'coffee',kcal:100,created_at:'2026-11-20T10:20:00.000Z',consumed_at:'2026-11-20T04:00:00.000Z'};
 const snack={id:'snack',kcal:100,created_at:'2026-11-20T05:00:00.000Z'};
 assert.equal(ctx.sort([snack,coffee],'time').map(f=>f.id).join(','),'coffee,snack');
 assert.equal(ctx.clock(coffee.consumed_at),'14:00');
 assert.equal(ctx.stamp('2026-11-20','00:15'),'2026-11-19T14:15:00.000Z');
 assert.match(h,/"entered_at_utc","consumed_at_utc"/);
});

test('entry bars share the day scale, use macro kJ colours and distinguish zero grams from unknown',()=>{
 const start=h.indexOf('const NUTRITION_COLOURS='),end=h.indexOf('function drawDayStack(');
 const funcs=h.slice(h.indexOf('function foodRowMacroParts('),h.indexOf('function foodEntryDetails('));
 const context={toKj:f=>f.kcal*4.184,kgf:new Intl.NumberFormat('en-AU',{maximumFractionDigits:1})};
 runInNewContext(h.slice(start,end)+funcs+';globalThis.parts=foodRowMacroParts;globalThis.rows=foodEntryNutrientRows;',context);
 const f={kcal:500/4.184,nutrition:{macros:{protein_g:10,fibre_g:4,carbs_g:0}}};
 const parts=context.parts(f);
 assert.equal(parts.map(p=>p.key).join(','),'protein_g,fibre_g,unknown');
 assert.equal(parts.map(p=>p.colour).join(','),'#a52f43,#77ab73,#a0ad9d');
 assert.ok(Math.abs(parts.reduce((n,p)=>n+p.percent,0)-100)<.01);
 assert.equal(context.rows(f).map(r=>r.value??'unknown').join(','),'10 g,4 g,0 g,unknown');
 assert.equal(context.parts({kcal:0}).length,0);
 assert.match(h,/maxFoodEnergy=Math\.max\(1,\.\.\.items\.map\(toKj\)\)/);
 assert.match(h,/bar\.style\.width=Math\.max\(0,toKj\(f\)\)\/maxFoodEnergy\*100/);
 assert.match(h,/details\.append\(summary,foodEntryDetails\(f,interactive\)\)/);
 assert.match(h,/edit\.style\.visibility=details\.open\?'visible':'hidden'/);
});

test('food sorting metrics have no hover underline and preserve keyboard focus',()=>{
 assert.doesNotMatch(h,/\.food-sort-metric:hover[^{}]*\{[^}]*text-decoration/);
 assert.match(h,/button:focus-visible[^{}]*\{outline:/);
 assert.match(h,/\.food-sort-metric:focus:not\(:focus-visible\)\{outline:none\}/);
 assert.match(h,/replacement\?\.focus\(\{preventScroll:true\}\)/);
});

test('expanded row and edit route use the same confirmation; only confirm sends DELETE',async()=>{
 const html=readFileSync('index.html','utf8');
 const source=html.slice(html.indexOf('function foodEntryDetails('),html.indexOf('function drawFoodList('))+
  html.slice(html.indexOf('let pendingFoodRemoval='),html.indexOf('function monthsBefore('));
 const calls=[],closed=[],nodes={};
 const make=(tag,text)=>({tag,text,children:[],append(...children){this.children.push(...children)},style:{setProperty(){}},focus(){},setAttribute(){}});
 const $=key=>nodes[key]??={open:false,showModal(){this.open=true},close(){this.open=false;this.onclose?.()},addEventListener(type,fn){this['on'+type]=fn}};
 const food={id:'exact',description:'Coffee'};
 const context={$,make,foodEntryNutrientRows:()=>[],foodDisplayName:x=>x,busy:false,ready:true,btnState(){},editId:null,state:{food:[food]},cancelEdit(){context.editId=null},
  api:async(...args)=>calls.push(args),refresh:async()=>{},openFoodEntries:{delete:id=>closed.push(id)},status(){}};
 runInNewContext(source,context);
 assert.equal(context.foodEntryDetails(food,false).children.length,2);
 const [remove]=context.foodEntryDetails(food,true).children[2].children;
 remove.onclick();assert.equal($('#removeFoodSheet').open,true);assert.equal(calls.length,0);
 $('#cancelRemoveFood').onclick();await $('#confirmRemoveFood').onclick();assert.equal(calls.length,0);
 context.editId='exact';$('#logSheet').open=true;$('#removeEditedFood').onclick();await $('#confirmRemoveFood').onclick();
 assert.equal(calls.length,1);assert.equal(calls[0][1].id,'exact');assert.equal(calls[0][3],'DELETE');
 assert.deepEqual(closed,['exact']);assert.equal($('#logSheet').open,false);
});
