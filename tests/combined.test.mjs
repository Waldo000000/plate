import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const html=readFileSync('index.html','utf8');
const chart=html.slice(html.indexOf('function drawEnergyChart'),html.indexOf('function draws'));
const ctx={chartPopup:null,dateNum:s=>Date.parse(s+'T00:00:00Z'),toKj:f=>f.kj,nf:new Intl.NumberFormat('en-AU'),kgf:new Intl.NumberFormat('en-AU',{maximumFractionDigits:1})};
const palette=html.match(/^const NUTRITION_COLOURS=.*;$/m)[0];
const script=palette+'\n'+html.slice(html.indexOf('function nutrientSummary'),html.indexOf('function dialColour'))
 +html.slice(html.indexOf('const HISTORY_SERIES'),html.indexOf('function drawEnergyChart'));
runInNewContext(script+';globalThis.fn={nutritionDayPath,drawNutritionLegend,nutritionHistory,proteinTargetForDay,HISTORY_SERIES,historyAmount,NUTRITION_COLOURS};',ctx);
const {nutritionDayPath,drawNutritionLegend,nutritionHistory,proteinTargetForDay,HISTORY_SERIES,historyAmount}=ctx.fn;
const food=(day,energy,p,f)=>({day,kj:energy,nutrition:{macros:{protein_g:p,fibre_g:f}}});
test('one percentage axis, three solid coloured traces, a compact legend and full plot width',()=>{
 assert.doesNotMatch(html,/id="energyHeading"|id="proteinChart"|id="chartData"|Exact values are in Settings/);
 assert.match(chart,/label\(0,10,'% of target'\)/);
 assert.match(chart,/line\(left,y\(100\),width-right,y\(100\),\{stroke:'#6e8072','stroke-width':1\.35,'stroke-dasharray':'5 4'\}/);
 assert.match(html,/const right=9,plot=width-left-right/);
 assert.match(html,/<div id="historyRange" class="range" role="group" aria-label="Shared history date range"/);
 assert.match(html,/\.nutrition-chart-head>\.range\{margin-inline-start:auto\}/);
 assert.match(html,/\.nutrition-series-legend\{[^}]*justify-content:flex-end/);
 assert.match(html,/id="nutritionSeriesLegend"[^>]+aria-label="Show target lines"/);
 assert.doesNotMatch(chart,/data-nutrition-leader/);
 assert.equal(HISTORY_SERIES.find(s=>s.key==='energy').colour,'#171917');
 assert.equal(HISTORY_SERIES.find(s=>s.key==='protein').colour,ctx.fn.NUTRITION_COLOURS.protein);
 assert.match(html,/NUTRITION_COLOURS=\{protein:"#a52f43"/);
 assert.doesNotMatch(chart,/stroke-dasharray':dash/);
 assert.match(html,/button\.dataset\.nutritionLabel=key/);
 assert.match(html,/linked-chart\.pointer-focus:focus[^}]*outline:none/);
 assert.match(html,/nutrition-series-button:focus-visible\{outline:2px/);
});
test('dated protein targets retain the original percentages',()=>{
 const first='2026-11-19',second='2026-11-20',today='2026-11-21';
 const settings={nutrition_target_legacy:{energy_budget_kj:8500},protein_target_g:150,protein_target_history:[{effective_day:first,target_g:100},{effective_day:second,target_g:150}]};
 const rows=nutritionHistory([food(first,8500,60,15),food(second,10200,60,30),food(today,1000,30,10)],today,settings);
 assert.deepEqual(Array.from(rows,r=>r.protein),[60,40,20]);
 assert.deepEqual(Array.from(rows.slice(0,2),r=>r.energy),[100,120]);
 assert.equal(proteinTargetForDay('2026-11-18',settings),null);
 assert.equal(proteinTargetForDay(today,{...settings,protein_target_history:[...settings.protein_target_history,{effective_day:today,target_g:null}]}),null);
});
test('known zero remains plotted, while an unlogged day or unset target does not create a value',()=>{
 const d='2026-11-19',e='2026-11-20',f='2026-11-23';
 const rows=nutritionHistory([food(d,900,0,0),food(e,1100,undefined,undefined),food(e,400,30,10),food('2026-11-22',500,undefined,undefined)],f,{protein_target_g:135,nutrition_target_legacy:{fibre_target_g:30}});
 assert.equal(rows.length,3);assert.ok(!rows.some(r=>r.day==='2026-11-21'));
 assert.equal(rows[0].protein,0);assert.equal(rows[0].fibre,0);
 assert.equal(rows[1].fibre,10/30*100);assert.equal(rows[2].protein,0);
 assert.equal(historyAmount(rows[1],HISTORY_SERIES.find(s=>s.key==='fibre')),'Fibre 10 / 30 g · 33%');
 assert.equal(nutritionHistory([food(d,900,20,5)],e,{})[0].protein,null);
});
test('past nutrition connects across unlogged days but never to the current day open circles',()=>{
 const rows=[{day:'2026-11-19',fibre:0},{day:'2026-11-21',fibre:null},{day:'2026-11-24',fibre:82},{day:'2026-11-25',fibre:10}];
 const x=t=>new Date(t).getUTCDate(),y=v=>v;
 assert.equal(nutritionDayPath(rows,'fibre',x,y,'2026-11-25').d,'M19.00 0.00L24.00 82.00');
 assert.equal(nutritionDayPath(rows,'fibre',x,y,'2026-11-25').last.day,'2026-11-24');
 assert.equal(nutritionDayPath(rows,'energy',x,y).last,undefined);
 assert.match(chart,/const paint=\(focus,day,px,record=false\)=>\{[^]*?addSvg\(focus,'circle',\{cx:px,cy:y\(r\[key\]\),r:nutritionPointRadius,fill:colour,/);
 assert.equal(nutritionDayPath(rows.slice(-1),'fibre',x,y,'2026-11-25').d,'');
 assert.match(chart,/addSvg\(svg,'circle',\{cx:x\(dateNum\(currentDay\)\),cy:y\(current\[key\]\),r:nutritionPointRadius-nutritionOpenStroke\/2,fill:'white',stroke:colour,'stroke-width':nutritionOpenStroke/);
 assert.match(chart,/if\(day===currentDay&&!record\)return/);
 assert.match(html,/if\(kind==='weight'\)for\(const point of detail.points\)addSvg\(focus,'circle'/);
 assert.doesNotMatch(chart,/loggedAverages|nutritionTrendPath|7-day average/);
});
test('legend buttons independently hide lines and both kinds of markers without rebuilding',()=>{
 const mk=()=>({children:[],dataset:{},attrs:{},style:{setProperty(){}},append(...els){this.children.push(...els)},get childElementCount(){return this.children.length},setAttribute(k,v){this.attrs[k]=v},addEventListener(k,fn){this[k]=fn},querySelector(sel){return this.children.find(o=>sel.includes('"'+o.dataset.nutritionLabel+'"'))}});
 const legend=mk(),marks=Object.fromEntries(['energy','protein','fibre'].map(key=>[key,[mk(),mk(),mk()]]));
 const wrap={querySelectorAll(sel){const key=Object.keys(marks).find(k=>sel.includes('"'+k+'"'));return marks[key]}};
 ctx.$=()=>legend;ctx.make=mk;ctx.addSvg=parent=>{const el=mk();parent.append(el);return el};
 drawNutritionLegend(wrap);
 const [energy,protein,fibre]=legend.children;
 energy.click();fibre.click();
 assert.deepEqual(legend.children.map(b=>b.attrs['aria-pressed']),['false','true','false']);
 assert.deepEqual(marks.fibre.map(m=>m.attrs.visibility),['hidden','hidden','hidden']);
 assert.deepEqual(marks.protein.map(m=>m.attrs.visibility),['visible','visible','visible']);
 protein.click();assert.ok(Object.values(marks).flat().every(m=>m.attrs.visibility==='hidden'));
 energy.click();assert.deepEqual(legend.children.map(b=>b.attrs['aria-pressed']),['true','false','false']);
 assert.equal(drawNutritionLegend(wrap).children[0],energy);
});

test('daily and chart targets use the date of the food, not the current preferences',()=>{
 const old='2026-11-20',next='2026-11-24',last='2026-11-25';
 const settings={energy_budget_kj:12400,fibre_target_g:null,protein_target_g:150,
  nutrition_target_history:[
   {metric:'energy_budget_kj',effective_day:old,target_value:8000},
   {metric:'fibre_target_g',effective_day:old,target_value:30},
   {metric:'energy_budget_kj',effective_day:next,target_value:12400},
   {metric:'fibre_target_g',effective_day:last,target_value:null},
  ],
  protein_target_history:[{effective_day:old,target_g:100},{effective_day:next,target_g:150}]};
 const rows=nutritionHistory([food('2026-11-19',8000,50,15),food(old,8000,50,15),food(next,6200,75,15),food(last,6200,75,15)],last,settings);
 assert.deepEqual(Array.from(rows,r=>[r.energy,r.protein,r.fibre]),[[null,null,null],[100,50,50],[50,50,50],[50,50,null]]);
 assert.match(html,/budgetModel\(items,goal,nutritionTargetForDay\('energy_budget_kj',day,state.settings\)\)/);
 assert.match(html,/const fibreGoal=nutritionTargetForDay\('fibre_target_g',day,state.settings\)/);
});
