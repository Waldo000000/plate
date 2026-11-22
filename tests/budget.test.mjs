import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {runInNewContext} from 'node:vm';
const h=readFileSync('index.html','utf8'),code=h.slice(h.indexOf('const NUTRITION_COLOURS='),h.indexOf("$('#openSettings').onclick"));
const ctx={toKj:f=>f.kcal*4.184};runInNewContext(code+';globalThis.m=budgetModel;globalThis.d=budgetDial;',ctx);
const food=(energy,p,f)=>({kcal:energy/4.184,nutrition:{macros:{...(p===null?{}:{protein_g:p}),...(f===null?{}:{fibre_g:f})}}});
test('budget and unknowns never conflate zeros and fractions',()=>{for(const f of [0,.2,null]){const m=ctx.m([food(500,6,f)],null,8500);assert.equal(m.reserve,0);assert.equal(m.fibre.known,f===null?0:1);assert.equal(m.fibre.grams,f??0)}});
test('actual over independent from reserve, optional target, exact boundary',()=>{for(const e of [0,7395,8300,8500,8550,19000])for(const p of [0,72,137,null])for(const goal of [null,137]){const m=ctx.m([food(e,p,0)],goal,8500);assert.equal(m.over,Math.max(0,e-8500));assert.equal(m.reserve,goal===null||p===null?0:Math.max(0,goal-p)*17);assert.ok(Math.abs(m.macros.segments.reduce((n,s)=>n+s.kj,0)-e)<.51)}});
test('thicker dials retain outside-only mask and exact fibre',()=>{const svg=ctx.d('fibre','Fibre','0.2','g',.2/30,false,'0.2/30 g');assert.match(svg,/stroke-width="15"/);assert.match(svg,/r="63" fill="black"/);assert.match(svg,/>0.2<\/text>/)});
test('group rounding reconciliation removes dust but not unknown ingredients',()=>{
 for(const [energy,allocation,unknown] of [[540.01,540,false],[467.02,467,false],[920.02,920,false],[920.02,600,true]]){
 const m=ctx.m([{kcal:energy/4.184,nutrition:{groups:{added_fats_oils:allocation}}}],null,8500);
 assert.equal(m.groups.segments.some(s=>s.key==='unknown'),unknown);
 assert.ok(Math.abs(m.groups.segments.reduce((n,s)=>n+s.kj,0)-energy)<.01);
 }
 assert.match(h,/group_.*_kj/);assert.match(h,/added_fats_oils:'oil-cruet'/);assert.match(h,/fruit:'🍊',grains:'🍞',protein:'🥩'/);
});
test('partial dials show known progress while wholly unknown dials have no fill',()=>{
 const m=ctx.m([food(48,null,4.5),food(2461,61.8,.2)],135,8500);
 assert.equal(m.protein.missing,1);
 assert.equal(m.reserve,0);
 const partial=ctx.d('protein','Protein','61.8','g',m.protein.grams/135,false,'61.8/135 g · partial',true);
 const unknown=ctx.d('protein','Protein','—','g',0,true,'—/135 g · unknown');
 assert.ok(Math.abs(Number(partial.match(/stroke-dasharray="([^ ]+) 100"/)[1])-45.78)<.01);
 assert.match(partial,/opacity="0.28"/);
 assert.match(unknown,/stroke-dasharray="0 100"/);
 assert.ok(h.includes("(!p.known&&pUnknown)||goal===null,pd,p.known>0&&p.missing>0"));
 assert.ok(h.includes("fibreGoal===null?0:f.grams/fibreGoal,(!f.known&&fUnknown)||fibreGoal===null,fd,f.known>0&&f.missing>0"));
});
test('all four details use the food entries directly, preserving split groups and unknown versus zero',()=>{
 const elems=new Map(),make=(tag,textContent,className)=>({tag,textContent,className,children:[],style:{},append(...c){this.children.push(...c)},replaceChildren(){this.children=[]},setAttribute(k,v){(this.attributes??={})[k]=v},showModal(){this.open=true}});
 Object.assign(ctx,{make,$:id=>{if(!elems.has(id))elems.set(id,make(id));return elems.get(id)},kgf:{format:n=>String(n)},showKj:n=>Math.round(n)+' kJ'});
 runInNewContext(h.slice(h.indexOf('function foodIcon('),h.indexOf('const consumedClockFormat='))+
  ';globalThis.openSheet=openNutritionSheet;globalThis.rows=nutritionRows;',ctx);
 const items=[{description:'Chips',kcal:400/4.184,nutrition:{macros:{protein_g:0,fibre_g:2},groups:{vegetables:250,added_fats_oils:150}}},
  {description:'Lasagne',kcal:1000/4.184,nutrition:{macros:{protein_g:20},groups:{grains:300,protein:450,dairy:250}}},
  {description:'Egg',kcal:300/4.184,nutrition:{macros:{fibre_g:0},groups:{protein:300}}}];
 const m=ctx.m(items,135,8500);
 const li=()=>elems.get('#nutritionItems').children;
 const values=row=>[(row.children[1].textContent??row.children[1].children[1].textContent),row.children[2].children[0].textContent];
 for(const [mode,title,expected] of [['protein','Protein',[['Lasagne','20 g'],['Chips','0 g'],['Egg','Not recorded']]],['fibre','Fibre',[['Chips','2 g'],['Egg','0 g'],['Lasagne','Not recorded']]],['energy','Energy',[['Lasagne','1000 kJ'],['Chips','400 kJ'],['Egg','300 kJ']]]]){
  ctx.openSheet(mode,items,m);
  assert.equal(elems.get('#nutritionSheet').open,true);
  assert.equal(elems.get('#nutritionTitle').textContent,title);
  assert.deepEqual(li().map(item=>values(item.children[0])),expected);
  assert.deepEqual(li().map(item=>[item.children[0].children[1].children[0].textContent,item.children[0].children[1].children[0].attributes['aria-hidden']]),
   expected.map(([name])=>[{Lasagne:'🍝',Chips:'🍟',Egg:'🍳'}[name],'true']));
  assert.equal(li()[0].children[0].children[0].children[0].style.width,'100%');
 }
 ctx.openSheet('plate',items,m);
 const groups=li().map(item=>item.children[0]);
 assert.ok(groups.every(group=>group.tag==='details'&&!group.open&&group.children[0].tag==='summary'));
 assert.deepEqual(values(groups[0].children[0].children[0]),['Meat, fish, eggs and alternatives','750 kJ']);
 const groupFill=group=>group.children[0].children[0].children[0].children[0].style;
 assert.equal(groupFill(groups[0]).background,'#b56853');
 const dairy=groups.find(group=>values(group.children[0].children[0])[0]==='Dairy and alternatives');
 assert.equal(groupFill(dairy).background,'#e4c43d');
 assert.equal(groupFill(dairy).width,250/750*100+'%');
 assert.equal(groups[0].children[0].children[0].children[1].children[0].textContent,'🥩');
 const foods=groups[0].children[1].children.map(li=>li.children[0]);
 assert.deepEqual(foods.map(values),[['Lasagne','450 kJ'],['Egg','300 kJ']]);
 assert.deepEqual(foods.map(row=>[row.children[1].children[0].textContent,row.children[1].children[0].attributes['aria-hidden']]),[['🍝','true'],['🍳','true']]);
 assert.equal(foods[0].children[2].children[1].textContent,'45% of item');
 assert.equal(elems.get('#nutritionTotal').textContent,'1700 kJ');
 ctx.openSheet('energy',[],ctx.m([],135,8500));
 assert.equal(elems.get('#nutritionItems').children[0].textContent,'No food entries');
 assert.match(h,/method="dialog"/);
});
test('macro bar and food plate retain their distinct Sky & Garnet and Mosaic colour keys',()=>{
 const food={kcal:1000/4.184,nutrition:{macros:{protein_g:15,carbs_g:12,fat_g:10,fibre_g:4},groups:{protein:260,grains:250,added_fats_oils:370,dairy:120}}};
 const m=ctx.m([food],135,8500);
 const colour=(parts,key)=>parts.segments.find(s=>s.key===key).colour;
 assert.deepEqual(['protein_g','fibre_g','carbs_g','fat_g'].map(k=>colour(m.macros,k)),['#a52f43','#77ab73','#d8ae72','#64a9d4']);
 runInNewContext('globalThis.mosaicColours=PLATE_COLOURS;',ctx);
 for(const key of ['protein','grains','added_fats_oils','dairy'])assert.equal(colour(m.groups,key),ctx.mosaicColours[key]);
 assert.match(h,/#a55b71 1px,transparent 1.3px/);
});
test('macro key follows bar order, labels unknown and distinguishes reserve from space left',()=>{
 runInNewContext('globalThis.key=macroBarKey;',ctx);
 const parts=[{key:'protein_g',colour:'#87354f'},{key:'carbs_g',colour:'#b99b70'},{key:'fat_g',colour:'#e9c443'},{key:'fibre_g',colour:'#157b72'},{key:'unknown',colour:'#899795'}];
 const labels=html=>[...html.matchAll(/aria-label="([^",]+), /g)].map(x=>x[1]);
 assert.deepEqual(labels(ctx.key(parts,700,1400,8500)),['Protein','For protein target','Fibre','Carbs','Fat']);
 assert.deepEqual(labels(ctx.key(parts,0,1400,8500)),['Protein','Fibre','Carbs','Fat']);
 assert.deepEqual(labels(ctx.key(parts,1400,500,8500)),['Protein','For protein target','Fibre','Carbs','Fat']);
 assert.equal(ctx.key([],0,0,null),'');
 assert.match(h,/details class="macro-legend"/);
 assert.match(h,/addSvg\(svg,'path'/);
});
test('thin segment marker uses the exact centre and the selected day layout stays compact',()=>{
 runInNewContext('globalThis.pos=macroKeyPosition',ctx);
 assert.equal(ctx.pos([{kj:400},{kj:2},{kj:598}],1,1000),0.401);
 assert.ok(h.indexOf('id="day"')<h.indexOf('id="foodList"'));
 assert.ok(h.indexOf('id="energyChart"')<h.indexOf('id="foodForm"'));
 assert.match(h,/<div id="foodListCard" class="food-list-card" role="region"/);
 assert.doesNotMatch(h,/Energy share|id="budgetDetails"/);
});
test('manual forms live inside the header Log sheet and a food row can open the edit form directly',()=>{
 const start=h.indexOf('id="logSheet"'),end=h.indexOf('</dialog>',start);
 for(const id of ['manualFood','manualWeight','foodForm','weightForm'])assert.ok(h.indexOf('id="'+id+'"')>start&&h.indexOf('id="'+id+'"')<end);
 assert.match(h,/function editFood\(f\)\{\s*openLog\("manualFood"\)/);
 assert.match(h,/<header class="mast"[\s\S]*id="todayButton"[\s\S]*id="day"[\s\S]*id="openSettings"[\s\S]*id="openLog"[\s\S]*<\/header>/);
 assert.doesNotMatch(h,/Weight chart legend/);
});
test('over-budget hatch spans only eaten overflow and never protein provision',()=>{
 Object.assign(ctx,{showKj:n=>Math.round(n)+' kJ'});
 runInNewContext('globalThis.overflow=macroOverflowSegment;globalThis.entries=macroBarEntries;',ctx);
 const over=ctx.m([food(9900,18,5)],135,8500),scale=over.total+over.reserve;
 const hatch=ctx.overflow(over,scale).match(/left:([\d.]+)%;width:([\d.]+)%/);
 assert.ok(Math.abs(+hatch[1]-(8500+over.reserve)/scale*100)<.001);
 assert.ok(Math.abs(+hatch[1]+ +hatch[2]-100)<.001);
 assert.ok(Math.abs(+hatch[2]-over.over/scale*100)<.001);
 const order=ctx.entries(over.macros.segments,over.reserve,over.left,over.budget,over.over).map(e=>e.name);
 assert.equal(order.slice(0,3).join(','),'Protein,Protein reserve,Fibre');
 const under=ctx.m([food(8000,18,5)],135,8500);
 assert.ok(under.total+under.reserve>8500);
 assert.equal(ctx.overflow(under,under.total+under.reserve),'');
 assert.equal(ctx.entries(under.macros.segments,under.reserve,under.left,under.budget).slice(0,3).map(e=>e.name).join(','),'Protein,Protein reserve,Fibre');
 assert.match(h,/\.protein-reserve\{background:radial-gradient/);
 assert.doesNotMatch(h,/<b>Plate<\/b><small>/);
});
test('pointer dialog return hides only pointer outlines; keyboard interaction restores them',()=>{
 const classes=new Set();
 const tile={dataset:{metric:'energy'},classList:{toggle(k,on){on?classes.add(k):classes.delete(k)},remove(k){classes.delete(k)}}};
 ctx.document={querySelectorAll:()=>[tile]};
 runInNewContext('globalThis.bindTile=bindNutritionTile;',ctx);
 ctx.bindTile(tile,[],ctx.m([],null,8500));
 tile.onclick({detail:1});assert.equal(classes.has('pointer-focus'),true);
 ctx.$('#nutritionSheet').onkeydown({key:'Escape'});assert.equal(classes.has('pointer-focus'),false);
 tile.onclick({detail:1});tile.onkeydown({key:'Tab'});assert.equal(classes.has('pointer-focus'),false);
 tile.onclick({detail:0});assert.equal(classes.has('pointer-focus'),false);
 assert.match(h,/button\.budget-mini\.pointer-focus:focus,\.macro-legend>summary\.pointer-focus:focus\{outline:none\}/);
 assert.match(h,/button:focus-visible,input:focus-visible,select:focus-visible\{outline:3px solid/);
});
test('desktop nutrition dialog is top anchored while mobile stays a bottom sheet',()=>{
 assert.match(h,/@media\(min-width:601px\)\{#nutritionSheet\{inset-block:0 auto;margin:8dvh auto 0;max-height:84dvh\}\}/);
 assert.match(h,/@media\(max-width:600px\)\{\.nutrition-sheet\{[^}]*margin:auto 0 0/);
 assert.match(h,/\.nutrition-sheet\{[^}]*overflow:auto/);
 assert.match(h,/\.nutrition-sheet header\{position:sticky;top:0/);
});
test('end bracket retains under, exact, actual-over and reserve-only boundaries',()=>{
 Object.assign(ctx,{showKj:n=>Math.round(n)+' kJ'});runInNewContext('globalThis.bracket=macroBudgetBracket;globalThis.label=budgetHeadingLabel;',ctx);
 for(const [total,reserve] of [[6200,493],[8500,0],[9600,0],[8200,680],[9600,680]]){
  const over=Math.max(0,total-8500),scale=Math.max(total+reserve,8500);
  const markup=ctx.bracket({budget:8500,total,reserve,over},scale);
  assert.equal(Number(markup.match(/left:([^%]+)%/)[1]),Math.min(100,(8500+(over?reserve:0))/scale*100));
  assert.doesNotMatch(markup,/ kJ budget/);assert.match(markup,/aria-hidden="true"/);
  assert.equal(ctx.label({budget:8500,over}),over>0?'<span class="budget-over">'+over+' kJ over 8500 kJ budget</span>':'<span class="budget-limit">8500 kJ budget</span>');
 }
 assert.equal(ctx.bracket({budget:null},1),'');
 assert.equal(ctx.label({budget:null,over:0}),'<span>No budget</span>');
 assert.match(h,/border-right:2px solid #45634c;border-block:2px solid #45634c/);
 assert.match(h,/transform:translateX\(-100%\)/);
});

test('Mosaic renders separate slices, steak and cheese, plus single-category and empty days',()=>{
 runInNewContext('globalThis.mosaic=mosaicPlate;',ctx);
 const segments=[{key:'dairy',colour:'#e1e7e8',kj:450},{key:'protein',colour:'#ead9d4',kj:550}];
 const svg=ctx.mosaic(segments);
 assert.equal((svg.match(/<path /g)||[]).length,2);
 assert.ok(svg.indexOf('🥩')<svg.indexOf('🧀'));
 assert.match(svg,/stroke-width="3.20" stroke-linejoin="round"/);
 const single=ctx.mosaic(segments.slice(0,1));
 assert.match(single,/<circle cx="96" cy="96" r="82\.3"/);
 assert.match(single,/x="96.000" y="96.000">🧀/);
 assert.doesNotMatch(ctx.mosaic([]),/<path|mosaic-icon|NaN/);
 assert.doesNotMatch(svg,/🥛|NaN/);
});

test('custom Peach & Plum preserves the macro matches and uses distinct meat and discretionary fills',()=>{
 runInNewContext('globalThis.plateBarColours=PLATE_BAR_COLOURS;globalThis.macroColours=NUTRITION_COLOURS;',ctx);
 const c=ctx.plateBarColours;
 assert.equal(c.added_fats_oils,ctx.macroColours.fat);
 assert.equal(c.grains,ctx.macroColours.carbs);
 assert.notEqual(c.protein,c.discretionary);
 assert.notEqual(c.dairy,c.grains);
 assert.notEqual(c.vegetables,ctx.macroColours.fibre);
 assert.match(h,/\.plate-group \.rank-track\{height:8px/);
 assert.match(h,/\.plate-group \.rank-track>span\{box-shadow:inset/);
});

test('Mosaic wedges stay muted and mirror each comparison bar, including unclassified',()=>{
 runInNewContext('globalThis.barTints=PLATE_BAR_COLOURS;globalThis.wedgeTints=PLATE_COLOURS;globalThis.plateMosaic=mosaicPlate;',ctx);
 const toRgb=c=>c.slice(1).match(/.{2}/g).map(p=>parseInt(p,16));
 for(const [key,fill] of Object.entries(ctx.barTints)){
  const wedge=ctx.wedgeTints[key];
  assert.deepEqual(toRgb(wedge),toRgb(fill).map((v,i)=>Math.round(v*.24+[253,252,247][i]*.76)),key);
  assert.ok(ctx.plateMosaic([{key,kj:500}]).includes('fill="'+wedge+'"'));
 }
 assert.notEqual(ctx.wedgeTints.protein,ctx.wedgeTints.discretionary);
});

test('discretionary Mosaic shows a biscuit and oils shows the custom cruet',()=>{
 runInNewContext('globalThis.plateIcons=mosaicPlate;globalThis.cruet=oilCruet;',ctx);
 assert.match(ctx.plateIcons([{key:'discretionary',kj:500}]),/>🍪<\/text>/);
 const oil=ctx.plateIcons([{key:'added_fats_oils',kj:500}]);
 assert.match(oil,/<svg class="oil-cruet" x="84.500" y="84.500"/);
 assert.doesNotMatch(oil,/🫒/);
 assert.match(ctx.cruet(),/aria-hidden="true"/);
});

test('the larger Mosaic has a narrower rim gap and an accessible name without a visible caption',()=>{
 assert.match(h,/MOSAIC_RIM_RADIUS=90,MOSAIC_WEDGE_RADIUS=82\.3/);
 assert.match(h,/data-metric="plate" aria-label="Plate"/);
 assert.doesNotMatch(h,/<b>Plate<\/b>/);
});

test('macro key opens over the reserved gap without adding a layout row',()=>{
 assert.match(h,/\.macro-key\{position:absolute;[^}]*justify-content:flex-start;[^}]*gap:8px/);
 assert.match(h,/\.macro-key:has\(\.reserve-key-label\)\{gap:clamp/);
 assert.match(h,/\.macro-legend\[open\]\+\.reserve-label\{visibility:hidden\}/);
 assert.doesNotMatch(h,/\.macro-legend\[open\]\+\.reserve-label\{display:none/);
 assert.match(h,/plus hypothetical protein reserve[^\n]*exceeds remaining budget/);
});

test('macro legend preference is set synchronously and restored for both committed and swipe preview renders',()=>{
 assert.match(h,/macroLegendOpen=d\.open=!d\.open/);
 assert.match(h,/let macroLegendRepaint=\(\)=>\{\},macroLegendOpen=false/);
 assert.match(h,/macro-legend"'\+\(macroLegendOpen\?' open':''\)/);
 assert.match(h,/drawBreakdown\(items,next,dash,false\)/);
});
