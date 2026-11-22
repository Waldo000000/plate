import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const html=readFileSync('index.html','utf8');
const tileCode=html.slice(html.indexOf('function bindNutritionTile('),html.indexOf('function openNutritionSheet('));
const code=html.slice(html.indexOf('function animateNutritionExit('),html.indexOf('const nutritionNarrow='));

test('a fresh clean touch opens its ring even without a compatibility click',()=>{
 const hit=[],handlers={};let cancelled=0;
 const bind=runInNewContext(tileCode+';bindNutritionTile',{openNutritionSheet(metric){hit.push(metric)}});
 const tile={dataset:{metric:'fibre'},isConnected:true,classList:{toggle(){},remove(){}},addEventListener(type,fn){handlers[type]=fn}};
 bind(tile,[],{});
 const fire=(type,x,y,t,extra={})=>{const touch={identifier:7,clientX:x,clientY:y};handlers[type]({touches:type==='touchend'?[]:[touch],changedTouches:[touch],timeStamp:t,cancelable:true,preventDefault(){cancelled++},...extra})};
 fire('touchstart',80,80,30);fire('touchend',82,81,55);assert.deepEqual(hit,['fibre']);assert.equal(cancelled,1);
 fire('touchstart',80,80,100);fire('touchmove',110,80,109);fire('touchend',80,80,130);assert.equal(hit.length,1);
 fire('touchstart',80,80,160);fire('touchcancel',80,80,165);fire('touchend',80,80,180);assert.equal(hit.length,1);
 fire('touchstart',80,80,200);tile.isConnected=false;fire('touchend',80,80,210);assert.equal(hit.length,1);
 tile.onclick({detail:0});assert.deepEqual(hit,['fibre','fibre']);
});
const bind=runInNewContext(code+';bindNutritionDismiss');
function setup({mobile=true,scroll=0,reduced=false}={}){
 const handlers={},styles=new Map(),classes=new Set(),exits=[];
 const modal={open:true,scrollTop:scroll,clientHeight:300,getBoundingClientRect:()=>({left:0,right:390,top:100,bottom:400}),addEventListener(type,fn,opts){handlers[type]={fn,opts}},
  style:{setProperty:(name,value)=>styles.set(name,value),removeProperty:name=>styles.delete(name)},
  classList:{toggle(name,value){value?classes.add(name):classes.delete(name)}},
  close(){this.open=false;handlers.close.fn()}};
 bind(modal,()=>mobile,()=>reduced,(sheet,offset,shade)=>{const exit={removed:false,offset,shade,remove(){this.removed=true}};exits.push(exit);return exit});
 let prevented=0;
 const touch=(type,x,y,t,extra={})=>{const contact={identifier:1,clientX:x,clientY:y};handlers[type].fn({touches:['touchstart','touchmove'].includes(type)?[contact]:[],changedTouches:[contact],timeStamp:t,cancelable:true,preventDefault(){prevented++},target:{closest:()=>false},...extra})};
 const p=(type,y,t,extra={})=>touch(type,100,y,t,extra);
 return {touch,p,styles,classes,exits,modal,get prevented(){return prevented},handlers};
}
test('one downward gesture pays scroll debt, follows the finger, and fades the backdrop',()=>{
 const s=setup({scroll:80});
 s.p('touchstart',100,0);s.p('touchmove',125,40);
 assert.equal(s.modal.scrollTop,55);assert.equal(s.styles.get('--nutrition-pull'),'0px');
 s.p('touchmove',203,100);
 assert.equal(s.modal.scrollTop,0);assert.equal(s.styles.get('--nutrition-pull'),'23px');
 assert.ok(Number(s.styles.get('--nutrition-shade'))<1);
 s.p('touchmove',165,150);
 assert.equal(s.modal.scrollTop,15);assert.equal(s.styles.get('--nutrition-pull'),'0px');
 s.p('touchend',165,180);assert.equal(s.modal.open,true);assert.equal(s.exits.length,0);
 assert.equal(s.classes.has('nutrition-pull-reset'),true);
});
test('snap back uses leftover pull, not total travel spent scrolling',()=>{
 const s=setup({scroll:120});s.p('touchstart',100,0);s.p('touchmove',230,70);s.p('touchend',238,110);
 assert.equal(s.modal.scrollTop,0);assert.equal(s.modal.open,true);assert.equal(s.exits.length,0);
 assert(!s.styles.has('--nutrition-pull'));assert(s.classes.has('nutrition-pull-reset'));
});
test('committed flick closes immediately; first tap can open same or another ring during inert exit',()=>{
 for(const next of ['protein','fibre']){
  const s=setup();s.p('touchstart',100,0);s.p('touchmove',140,70);s.p('touchend',151,110);
  assert.equal(s.modal.open,false);assert.equal(s.prevented,2);assert.equal(s.exits[0].offset,51);
  const open=runInNewContext(tileCode+';bindNutritionTile',{openNutritionSheet(metric){s.modal.clearNutritionExit();s.modal.metric=metric;s.modal.open=true}});
  const tile={dataset:{metric:next},classList:{toggle(){},remove(){}}};
  open(tile,[],{});tile.onclick({detail:1});
  assert.equal(s.exits[0].removed,true);assert.equal(s.modal.open,true);assert.equal(s.modal.metric,next);
 }
 assert.match(html,/layer.inert=true;layer.setAttribute\('aria-hidden','true'\)/);
 assert.match(html,/node.removeAttribute\('id'\)/);assert.match(html,/\.nutrition-exit,\.nutrition-exit \*\{pointer-events:none/);
 assert.doesNotMatch(code,/setTimeout|addEventListener\('click'/);
});
test('upward, horizontal, pinch, taps, controls and desktop are not intercepted',()=>{
 for(const [params,x,y,extra] of [[{},105,70,{}],[{},170,140,{}],[{},100,102,{}],[{},100,200,{target:{closest:()=>true}}],[{mobile:false},100,200,{}]]){
  const s=setup(params);s.touch('touchstart',100,100,0,extra);s.touch('touchmove',x,y,50);s.touch('touchend',x,y,150);
  assert.equal(s.modal.open,true);assert.equal(s.prevented,0);
 }
 const s=setup();s.p('touchstart',100,0);s.p('touchmove',120,30,{touches:[{},{}]});s.p('touchend',230,100);
 assert.equal(s.modal.open,true);assert.equal(s.prevented,0);
 assert.equal(s.handlers.touchmove.opts.passive,false);
 assert.match(html,/bindNutritionDismiss\(\$\('#nutritionSheet'\)/);
});
test('cancel and reduced motion reset cleanly without delaying close',()=>{
 const s=setup();s.p('touchstart',100,0);s.p('touchmove',190,30);s.p('touchcancel',190,50);
 assert.equal(s.modal.open,true);assert.equal(s.styles.size,0);
 const r=setup({reduced:true});r.p('touchstart',100,0);r.p('touchmove',180,100);r.p('touchend',181,300);
 assert.equal(r.modal.open,false);assert.equal(r.exits.length,0);assert.equal(r.classes.size,0);
});


test('a native backdrop touch retargeted to the dialog cannot start a pull',()=>{
 const s=setup();
 s.p('touchstart',80,0,{target:Object.assign(s.modal,{closest:()=>false})});
 s.p('touchmove',150,40);s.p('touchend',210,90);
 assert.equal(s.prevented,0);assert.equal(s.modal.open,true);assert.equal(s.styles.size,0);
 // The dialog itself is a legitimate target inside its drawn box.
 s.p('touchstart',120,100,{target:s.modal});s.p('touchmove',165,140);s.p('touchend',180,190);
 assert.equal(s.modal.open,false);assert.equal(s.exits[0].offset,60);
});

test('Settings and Log also use the touch controller and reset their decorative exit on reopen',()=>{
 for(const id of ['appSettings','logSheet']){
  assert.ok(html.includes("bindNutritionDismiss($('#"+id+"'),()=>nutritionNarrow?.matches===true,()=>swipeMotion?.matches===true)"));
 }
 assert.match(html,/:is\(#nutritionSheet,#appSettings,#logSheet\)>header/);
 assert.equal((html.match(/sheet.clearNutritionExit\?\.\(\);sheet.showModal\(\)/g)||[]).length,2);
});
