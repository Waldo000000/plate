import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {runInNewContext} from 'node:vm';
const html=readFileSync('index.html','utf8');
const source=html.slice(html.indexOf('// Calendar selection is independent'),html.indexOf('function wireLinkedChart'));
function setup(){
 const picker={value:'2026-11-19'},changes=[],scroll=[];
 const surface={clientWidth:800,top:130,getBoundingClientRect(){return {top:this.top}}};
 const ctx={ready:true,busy:false,dayFlick:null,clearPeek(){},document:{},$:id=>id==='#dailyLog'?surface:picker,today:()=> '2026-11-20',cancelEdit(){},status(){},updateManualDate(){},drawDay(){changes.push(picker.value);surface.top+=250},window:{scrollBy({top}){scroll.push(top);surface.top-=top}},dayAfterFlick(day,n,last){const d=new Date(Date.parse(day+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);return d<=last?d:null}};
 runInNewContext(source+';globalThis.wheel=handleDayWheel;globalThis.cancel=cancelDayNavigation;globalThis.select=selectChartDay;',ctx);
 let prevented=0;
 const event=(x,y,time,extra={})=>({deltaX:x,deltaY:y,timeStamp:time,deltaMode:0,cancelable:true,preventDefault(){prevented++},target:{closest:()=>false},...extra});
 return {ctx,picker,changes,scroll,surface,event,get prevented(){return prevented}};
}
test('horizontal threshold, both directions and inertia step one day per burst',()=>{
 const s=setup();s.ctx.wheel(s.event(-20,0,0),s.surface);assert.equal(s.changes.length,0);
 s.ctx.wheel(s.event(-30,0,20),s.surface);assert.equal(s.picker.value,'2026-11-18');
 for(const t of [40,80,150,250])s.ctx.wheel(s.event(-100,0,t),s.surface);
 assert.equal(s.changes.length,1);s.ctx.wheel(s.event(60,0,600),s.surface);assert.equal(s.picker.value,'2026-11-19');
 assert.deepEqual(s.scroll,[250,250]);
});
test('vertical scroll, pinch, modifiers and controls remain native',()=>{
 const s=setup();for(const e of [s.event(0,80,0),s.event(30,60,20),s.event(90,0,40,{ctrlKey:true}),s.event(0,90,60,{shiftKey:true}),s.event(90,0,80,{target:{closest:()=>true}})])s.ctx.wheel(e,s.surface);
 assert.equal(s.changes.length,0);assert.equal(s.prevented,0);
});
test('conflicting action clears partial intent and momentum cannot undo Today',()=>{
 const s=setup();s.ctx.wheel(s.event(-30,0,0),s.surface);s.ctx.cancel();s.ctx.wheel(s.event(-30,0,20),s.surface);assert.equal(s.changes.length,0);
 s.ctx.select('2026-11-20');s.ctx.wheel(s.event(-100,0,40),s.surface);assert.equal(s.picker.value,'2026-11-20');
 s.ctx.wheel(s.event(-60,0,500),s.surface);assert.equal(s.picker.value,'2026-11-19');
});
test('line/page deltas normalized; today ceiling consumes gesture without moving',()=>{
 const s=setup();s.ctx.wheel(s.event(4,0,0,{deltaMode:1}),s.surface);assert.equal(s.picker.value,'2026-11-20');
 s.ctx.wheel(s.event(1,0,500,{deltaMode:2}),s.surface);assert.equal(s.changes.length,1);
 s.ctx.wheel(s.event(-1,0,520,{deltaMode:2}),s.surface);assert.equal(s.changes.length,1);
});
test('wheel registration scoped to day card and two chart wrappers',()=>{
 assert.match(html,/wireDayWheel\(\$\('#budgetDashboard'\).parentElement\)/);
 assert.match(html,/wireDayWheel\(\$\('#chart'\)\)/);assert.match(html,/wireDayWheel\(\$\('#energyChart'\)\)/);
 assert.match(html,/surface.addEventListener\('wheel',[^\n]+passive:false/);
});

test('Shift with actual horizontal delta is accepted, never synthesized from vertical',()=>{const s=setup();s.ctx.wheel(s.event(-60,0,0,{shiftKey:true}),s.surface);assert.equal(s.picker.value,'2026-11-18')});
