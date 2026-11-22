import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {runInNewContext} from 'node:vm';
const html=readFileSync('index.html','utf8');
const home=html.slice(html.indexOf('// One home-date action;'),html.indexOf('function wireLinkedChart'));
const nav=html.slice(html.indexOf('// Calendar days, not log entries:'),html.indexOf('// Tap controls for the attached food tray'));
function setup(){const nodes={},timers=[];const node=id=>nodes[id]??={value:'',hidden:false,style:{setProperty(){}},classList:{add(){},remove(){}},setAttribute(){},replaceChildren(){},addEventListener(type,fn){this[type]=fn},getBoundingClientRect:()=>({top:100}),focus(){}};
 node('#day').value='2026-11-18';const c={selectedWeightEstimate:()=>null,state:{weights:[]},roundKg:n=>n+' kg',ready:true,busy:false,DAY:86400000,dateNum:s=>Date.parse(s+'T00:00:00Z'),toDay:t=>new Date(t).toISOString().slice(0,10),today:()=> '2026-11-20',$:node,document:{activeElement:null},cancelEdit(){},status(){},updateManualDate(){},drawDay(){c.updateTodayButton()},clearTimeout(){},setTimeout(fn){timers.push(fn);return timers.length},window:{scrollBy(){}}};runInNewContext(home+nav,c);return {c,nodes,timers,node};}
test('Today press-start cancels an active swipe preview and click wins on first attempt',()=>{
 const s=setup();runInNewContext("swipePeek={day:'2026-11-19'};dayFlick={id:1}",s.c);
 s.node('#todayButton').onpointerdown();assert.equal(runInNewContext('dayFlick===null&&swipePeek===null',s.c),true);s.node('#todayButton').onclick();for(const fn of s.timers)fn();assert.equal(s.node('#day').value,'2026-11-20');assert.equal(s.node('#todayButton').hidden,true);
});
test('native keyboard Today action also clears in-flight flick state',()=>{
 const s=setup();runInNewContext("swipePeek={day:'2026-11-17'};dayFlick={id:1}",s.c);
 s.node('#todayButton').onkeydown({key:'Enter'});assert.equal(runInNewContext('dayFlick===null&&swipePeek===null',s.c),true);s.node('#todayButton').onclick();for(const fn of s.timers)fn();assert.equal(s.node('#day').value,'2026-11-20');
});

test('first clean touch returns to Today even if the browser never dispatches a click',()=>{
 const s=setup(),button=s.node('#todayButton'),touch={identifier:8,clientX:17,clientY:23};
 runInNewContext("swipePeek={day:'2026-11-19'};dayFlick={id:1}",s.c);
 button.onpointerdown();
 button.touchstart({touches:[touch],changedTouches:[touch],timeStamp:100});
 let cancelled=false;
 button.touchend({touches:[],changedTouches:[touch],timeStamp:150,cancelable:true,preventDefault(){cancelled=true}});
 assert.equal(cancelled,true);
 assert.equal(s.node('#day').value,'2026-11-20');
 assert.equal(button.hidden,true);
});
