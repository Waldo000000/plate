import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const h=readFileSync('index.html','utf8');
const source=h.slice(h.indexOf('function tileCellBounds('),h.indexOf('function drawTrackTiles('));
const c={historyAmount:(r,s)=>s.name+' '+r.values[s.key],budgetPace:(budget,day,logged)=>({colour:logged?'green':'grey',status:day+' '+budget.budget}),dialColour:(r)=>'ratio '+r};
runInNewContext(source+';globalThis.api={tileCellBounds,nutritionTileCell}',c);
test('continuous Tiles centres use the same calendar pixel coordinates, even when subpixel',()=>{
 for(const span of [1,30,366,1200]){
  const left=49,plot=220,interval=plot/span,x=day=>left+(day+.5)*interval;
  for(const day of [0,Math.floor(span/2),span-1]){
   const b=c.api.tileCellBounds({interval,x},day);
   assert.ok(Math.abs(b.x+b.width/2-x(day))<1e-9);assert.ok(b.width>0);
  }
  if(interval<6)assert.equal(c.api.tileCellBounds({interval,x},0).width,interval);
 }
 assert.doesNotMatch(h,/trackTilePage|track-tile-nav|track-tile-scroll/);
 assert.match(h,/frame=embedded\?\?chartFrame\(wrap,'tiles',start,end\)/);
 assert.match(h,/commands.join\(''\)/);
});
test('unrecorded, actual zero, and date-effective energy targets are distinguishable',()=>{
 const row={protein:0,values:{energy:8600,protein:0,fibre:0},targets:{energy:8500,protein:135,fibre:30},recorded:{energy:true,protein:true,fibre:false}};
 const cell=(key,name,data=row)=>c.api.nutritionTileCell({key,name},data,'2026-11-23');
 assert.equal(cell('energy','Energy').text,'Energy 8600 · 2026-11-23 8500');
 assert.equal(cell('protein','Protein').colour,'ratio 0');
 assert.equal(cell('fibre','Fibre').text,'Fibre not recorded');
 assert.equal(cell('energy','Energy',null).colour,null);
 assert.match(h,/id="trackTargetsToggle"[^>]*aria-pressed="true"/);
 assert.match(h,/drawTrackTiles\(wrap,start,end,daily,tileRows\)/);
});
test('tile row names use the line legend palette without overriding target-coloured cells',()=>{
 assert.match(h,/\{name,colour\}\] of HISTORY_SERIES.entries\(\)/);
 assert.match(h,/if\(!embedded\)label\(0,y\+Math.round\(cellHeight\/2\)\+4,name,\{fill:colour/);
 assert.match(h,/batch.get\(cell.colour\).push\(d\)/);
});
