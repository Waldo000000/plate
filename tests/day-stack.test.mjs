import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {test} from 'node:test';
import assert from 'node:assert/strict';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const source=html.slice(html.indexOf('const NUTRITION_COLOURS='),html.indexOf('function drawBreakdown'));
function setup(){
 const nodes={};const make=()=>({children:[],replaceChildren(){this.children=[]}});
 const context={ready:true,nf:new Intl.NumberFormat('en-AU'),toKj:f=>f.kcal*4.184,showKj:x=>Math.round(x)+' kJ',displayEnergyNumber:x=>Math.round(x).toString(),energySymbol:()=>'kJ',$:id=>nodes[id]??=make(),addSvg:(parent,tag,attrs,text)=>{const node={...make(),tag,attrs,text};parent.children.push(node);return node;}};
 runInNewContext(source+';globalThis.api={breakdown,stackSegments,drawDayStack}',context);
 return {...context.api,nodes};
}
test('core, unknown, discretionary stack bottom to top without losing energy',()=>{
 const {breakdown,stackSegments}=setup();
 const d=breakdown([{kcal:1000/4.184,nutrition:{groups:{dairy:300,discretionary:500}}}],'groups');
 const s=stackSegments(d.segments,'groups');
 assert.deepEqual(Array.from(s,x=>x.key),['dairy','unknown','discretionary']);
 assert.equal(s.reduce((n,x)=>n+x.kj,0),1000);
});
test('macro energy estimates remain bounded and unassigned energy stays distinct',()=>{
 const {breakdown,stackSegments}=setup();
 const d=breakdown([{kcal:540/4.184,nutrition:{macros:{protein_g:6.8,carbs_g:9.4,fat_g:7.4}}}],'macros');
 assert.deepEqual(Array.from(stackSegments(d.segments,'macros'),x=>x.key),['protein_g','carbs_g','fat_g']);
 assert.ok(Math.abs(d.segments.reduce((n,x)=>n+x.kj,0)-540)<.01);
});
test('render empty, historical, target and over-target days with finite SVG coordinates',()=>{
 for(const total of [0,540,8500,12000])for(const target of [null,8500]){
  const {breakdown,drawDayStack,nodes}=setup();const d=breakdown([{kcal:total/4.184}],'groups');drawDayStack(d,target,'groups');
  const walk=node=>{for(const v of Object.values(node.attrs??{}))if(typeof v==='number')assert.ok(Number.isFinite(v));for(const child of node.children)walk(child)};walk(nodes['#dayStack']);
  assert.equal(nodes['#dayStack'].children.filter(x=>x.tag==='text'&&x.text?.startsWith('Target')).length,target===null?0:1);
 }
});
