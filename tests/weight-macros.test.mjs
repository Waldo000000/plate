import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const h=readFileSync('index.html','utf8');
const source=h.slice(h.indexOf('function chartFrame'),h.indexOf('const HISTORY_SERIES='));
const breakdown=h.slice(h.indexOf('const NUTRITION_COLOURS='),h.indexOf('function stackSegments'));
const day='2026-11-24',prev='2026-11-22';
const fmt={format:value=>String(value)};
const dateNum=key=>Date.parse(key+'T00:00:00Z');
const toDay=n=>new Date(n).toISOString().slice(0,10);
function setup(){
 let unit='kJ',rebuilds=0;
 const nodes={
  '#weightMacrosToggle':{setAttribute(key,value){this[key]=value}},
  '#weightMacrosDetails':{textContent:''},
 };
 const c={
  $:key=>nodes[key],DAY:86400000,toDay,dateNum,dateFmt:fmt,dateYearFmt:fmt,dateFullFmt:fmt,
  trendIntervals:()=>[],niceBounds:(_a,_b,min)=>{assert.equal(min,1);return {min:80,max:90,ticks:[80,90]}},kgf:fmt,roundKg:n=>n+' kg',
  toKj:r=>r.kj, shortDate:d=>d,
  energySymbol:()=>unit,energyInDisplayUnit:n=>unit==='kcal'?n/4.184:n,energyFromDisplayUnit:n=>unit==='kcal'?n*4.184:n,
  tickStep:(peak,ticks,min)=>{
   const raw=Math.max(min,peak/ticks),power=10**Math.floor(Math.log10(raw));
   return ([1,2,2.5,5,10].find(n=>n*power>=raw)??10)*power;
  },
  addSvg:(parent,tag,attrs,text)=>{const el={tag,attrs,text,children:[]};parent.children.push(el);return el},
  wireLinkedChart:(frame,_wrap,_kind,_start,_end,_values,paint)=>{c.frame=frame;c.paint=paint},
  draws:()=>{rebuilds++},window:{addEventListener(){}},document:{scrollingElement:null},saveHistoryView(){},ready:true,weightMacrosVisible:false,make:()=>({style:{},setAttribute(){},append(){}}),
 };
 c.displayEnergyNumber=n=>String(Math.round(c.energyInDisplayUnit(n)));
 c.showKj=n=>c.displayEnergyNumber(n)+' '+unit;
 runInNewContext(h.slice(h.indexOf('function tileCellBounds'),h.indexOf('const TILE_ENERGY_TONES'))+'\n'+h.slice(h.indexOf('function nutritionTargetForDay'),h.indexOf('function proteinTargetForDay'))+'\n'+breakdown+'\n'+h.slice(h.indexOf('function nutrientSummary'),h.indexOf('function dialColour'))+'\n'+source+';globalThis.api={chartFrame,drawWeightChart,weightMacroDays,macroBudgetRuns}',c);
 return {c,nodes,get rebuilds(){return rebuilds},setUnit:s=>unit=s};
}
const food=(day,kj,macros={})=>({day,kj,nutrition:{macros}});
const rects=svg=>svg.children.find(x=>x.attrs.class==='weight-macro-bars');
test('strip starts off; its toggle rebuilds only weight and can restore original height',()=>{
 const {c,nodes}=setup(),button=nodes['#weightMacrosToggle'],wrap=()=>({children:[],clientWidth:320});
 assert.match(h,/<button id="weightMacrosToggle"[^>]+aria-pressed="false"/);
 c.api.drawWeightChart(wrap(),dateNum(prev),dateNum(day),[]);
 assert.equal(c.frame.height,168);assert.equal(rects(c.frame.svg),undefined);assert.equal(c.frame.macroTint,null);
 button.onclick({currentTarget:button});
 assert.equal(button['aria-pressed'],'true');assert.equal(nodes['#weightMacrosDetails'].hidden,false);
 c.api.drawWeightChart(wrap(),dateNum(prev),dateNum(day),[],null,new Map());
 assert.equal(c.frame.height,265);assert.equal(c.frame.macroTint.attrs.fill,'#eef3ed');
 assert.match(c.frame.svg.children[0].text,/Weight \(kg\) and logged macro energy \(kJ\)/);
 button.onclick({currentTarget:button});
 assert.equal(button['aria-pressed'],'false');assert.equal(nodes['#weightMacrosDetails'].hidden,true);
 c.api.drawWeightChart(wrap(),dateNum(prev),dateNum(day),[]);
 assert.equal(c.frame.height,168);assert.equal(rects(c.frame.svg),undefined);
});
test('macro data stays calendar-aligned, blank for missing dates, and outlines today separately',()=>{
 const {c,nodes,setUnit}=setup(),wrap=()=>({children:[],clientWidth:320});
 const meals=[food('2026-11-21',99999),food(prev,1100,{protein_g:10,carbs_g:40}),food(prev,600),food(day,418.4,{fat_g:5}),food('2026-11-25',80000)];
 const rows=c.api.weightMacroDays(meals,prev,day);
 assert.deepEqual([...rows.keys()],[prev,day]);assert.equal(rows.get(prev).total,1700);assert.equal(rows.get(day).total,418.4);
 assert.equal(rows.get(prev).segments.find(x=>x.key==='unknown').kj,850);
 const start=dateNum(prev),end=dateNum(day);
 c.api.drawWeightChart(wrap(),start,end,[[start,85]],null,rows);
 const {frame}=c,bar=rects(frame.svg),todayOutline=bar.children.find(n=>'data-weight-macro-today' in n.attrs);
 assert.equal(todayOutline.attrs.x+todayOutline.attrs.width/2,frame.x(end));
 assert.equal(todayOutline.attrs['stroke-dasharray'],'2 2');
 const past=bar.children.find(n=>n.attrs['data-weight-macro']==='protein_g');
 assert.ok(Math.abs(Number(past.attrs.d.match(/^M(\d+(?:\.\d+)?)/)[1])+todayOutline.attrs.width/2-frame.x(start))<.01);
 c.paint(null,'2026-11-23');
 assert.equal(nodes['#weightMacrosDetails'].textContent,'2026-11-23: No food logged');
 c.paint(null,day);
 assert.match(nodes['#weightMacrosDetails'].textContent,/418 kJ so far · Fat 185 kJ/);
 setUnit('kcal');c.api.drawWeightChart(wrap(),start,end,[[start,85]],null,rows);
 assert.match(c.frame.svg.children[0].text,/macro energy \(kcal\)/);
 c.paint(null,day);
 assert.match(nodes['#weightMacrosDetails'].textContent,/100 kcal so far · Fat 44 kcal/);
});
test('toggle is in the shared header, and the chart has no visible legend or macro totals',()=>{
 assert.match(h,/<div class="shared-history-head">.*<button id="weightMacrosToggle"/);
 assert.doesNotMatch(h,/weightMacrosKey|weight-macro-tools/);
 assert.match(h,/\.weight-macro-detail\{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset\(50%\)/);
 assert.match(h,/\.progress-head\.weight-chart-head\{grid-template-columns:minmax\(54px,1fr\) auto\}/);
});

test('macro axis uses visible max with no needless padding around 15,000 kJ',()=>{
 const {c}=setup(),start=dateNum(prev),end=dateNum(day),wrap=()=>({children:[],clientWidth:320});
 const labels=value=>{
  const rows=c.api.weightMacroDays([food(day,value),food('2025-01-01',99000)],prev,day);
  c.api.drawWeightChart(wrap(),start,end,[],null,rows);
  return c.frame.svg.children.filter(e=>e.tag==='text'&&'data-history-y-tick' in e.attrs&&Number(e.attrs.y)>c.frame.macroTop).map(e=>e.text);
 };
 assert.deepEqual(labels(14999),['5k','10k','15k']);
 assert.deepEqual(labels(15000),['5k','10k','15k']);
 assert.equal(labels(15001).at(-1),'20k');
 assert.equal(labels(1850).at(-1),'2k');
});

test('macro budget steps at the first edge of its effective day and breaks across unknown dates',()=>{
 const {c,setUnit}=setup();
 const start=dateNum('2026-11-20'),end=dateNum('2026-11-24');
 const settings={nutrition_target_history:[{metric:'energy_budget_kj',effective_day:'2026-11-21',target_value:8500},
  {metric:'fibre_target_g',effective_day:'2026-11-21',target_value:30},
  {metric:'energy_budget_kj',effective_day:'2026-11-22',target_value:11300},
  {metric:'energy_budget_kj',effective_day:'2026-11-23',target_value:null},
  {metric:'energy_budget_kj',effective_day:'2026-11-24',target_value:12400}]};
 const runs=c.api.macroBudgetRuns(start,end,settings);
 assert.deepEqual(Array.from(runs,r=>[toDay(r.from),toDay(r.until),r.value]),[
  ['2026-11-21','2026-11-22',8500],['2026-11-22','2026-11-23',11300],['2026-11-24','2026-11-25',12400]
 ]);
 assert.deepEqual(Array.from(c.api.macroBudgetRuns(start,end,{})),[]);
 for(const unit of ['kJ','kcal']){
  setUnit(unit);
  const frame=c.api.chartFrame({children:[],clientWidth:320},'weight',start,end,true);
  const rows=c.api.weightMacroDays([food(day,100,{protein_g:2}),food(prev,300,{protein_g:4})],toDay(start),toDay(end));
  runInNewContext('globalThis.budgetMacro=drawWeightMacros',c);
  c.budgetMacro(frame,rows,day,runs);
  const stroke=frame.svg.children.find(e=>'data-weight-budget' in e.attrs);
  assert.match(stroke.attrs.d,/^M103 [\d.]+H155V[\d.]+H207M259 [\d.]+H311$/);
  assert.equal(stroke.children[0].text,'Daily energy budget by date ('+unit+')');
  const bars=rects(frame.svg).children.filter(e=>e.tag==='path');
  assert.ok(bars.some(e=>e.attrs['data-weight-macro'].endsWith('-today')&&e.attrs.opacity===.34));
  assert.ok(bars.some(e=>!e.attrs['data-weight-macro'].endsWith('-today')&&e.attrs.opacity===.72));
 }
});
