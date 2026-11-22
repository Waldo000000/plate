import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const html=readFileSync('index.html','utf8');
const source=html.slice(html.indexOf('// Calendar days, not log entries:'),html.indexOf('// Tap controls for the attached food tray'));
function setup(){
 const handlers={},date={value:'2026-11-20',checkValidity:()=>true,addEventListener:(type,fn)=>handlers[type]=fn},details={open:false};
 const label={hidden:true},daily={addEventListener:(type,fn)=>handlers[type]=fn};
 const classes=new Set(),viewport={clientWidth:300,classList:{add(k){classes.add(k)},remove(k){classes.delete(k)}},style:{setProperty(){}}},preview={hidden:true,replaceChildren(){}};
 let renders=0;
 const c={DAY:86400000,$:s=>({'#day':date,'#dailyLog':daily,'#swipeViewport':viewport,'#swipePreview':preview,'#swipeDayLabel':label,'#foodListCard':details}[s]),today:()=> '2026-11-20',ready:true,busy:false,dateNum:s=>Date.parse(s+'T00:00:00Z'),toDay:t=>new Date(t).toISOString().slice(0,10),dateFullFmt:{format:t=>new Date(t).toISOString().slice(0,10)},shortDate:s=>s,captureDayScrollAnchor(){return null},restoreDayScrollAnchor(){},cancelDayNavigation(){},navigationEpoch:0,dayAnchorPress:0,document:{addEventListener(type,fn){handlers['document:'+type]=fn}},dismissChartValues(){},cancelEdit(){},status(){},updateManualDate(){},drawDay(){renders++},clearTimeout(){},setTimeout(){}};
 runInNewContext(source+';globalThis.shift=dayAfterFlick;',c);
 const event=(x,y,timeStamp,opt={})=>({pointerId:1,pointerType:'touch',isPrimary:true,target:{closest:()=>null},clientX:x,clientY:y,timeStamp,...opt});
 const swipe=(dx,dy=0,opt={})=>{handlers.pointerdown(event(150,150,0,opt));handlers.pointermove(event(150+dx*.5,150+dy*.5,60,opt));handlers.pointerup(event(150+dx,150+dy,130,opt))};
 return {handlers,date,details,label,event,swipe,c,classes,preview,get renders(){return renders}};
}
test('swipe moves one calendar day, preserves collapse, and uses today as the ceiling',()=>{
 const x=setup();
 x.swipe(90);assert.equal(x.date.value,'2026-11-19');assert.equal(x.details.open,false);assert.equal(x.label.textContent,'2026-11-19');
 x.details.open=true;x.swipe(-90);assert.equal(x.date.value,'2026-11-20');assert.equal(x.details.open,true);
 x.swipe(-90);assert.equal(x.date.value,'2026-11-20');assert.equal(x.renders,2);
 assert.equal(x.c.shift('2024-03-01',-1,'2026-11-20'),'2024-02-29');
 assert.equal(x.c.shift('2026-01-01',-1,'2026-11-20'),'2025-12-31');
 assert.match(html,/<div id="foodListCard" class="food-list-card" role="region"/);
 assert.doesNotMatch(html,/dayWeight/);
});

test('normal release motion is decorative and a fresh press stops it without a second redraw',()=>{
 const x=setup(),animations=[];let removed=false;
 const animate=(frames,options)=>{const a={frames,options,cancel(){this.cancelled=true}};animations.push(a);return a};
 const old={animate,removeAttribute(){},setAttribute(){},querySelectorAll:()=>[],classList:{add(){}},remove(){removed=true}};
 const lookup=x.c.$;x.c.$=id=>id==='#swipeCurrent'?{animate,cloneNode:()=>old}:lookup(id);lookup('#swipeViewport').append=()=>{};
 x.swipe(90);
 assert.equal(x.date.value,'2026-11-19');assert.equal(x.renders,1);assert.equal(old.inert,true);
 assert.equal(animations[0].options.duration,175);assert.equal(x.classes.has('day-swipe-finishing'),true);
 x.handlers['document:pointerdown']();
 assert.equal(removed,true);assert.equal(x.classes.has('day-swipe-finishing'),false);
 assert.equal(x.renders,1);assert.equal(x.c.dayAnchorPress,1);
});
test('scrolling, small movements, picker, mouse and multitouch do not switch day',()=>{
 const x=setup();
 x.swipe(90,145);x.swipe(25);x.swipe(90,0,{pointerType:'mouse'});x.swipe(90,0,{target:{closest:()=>true}});
 x.handlers.pointerdown(x.event(150,150,0));x.handlers.pointerdown(x.event(155,150,15,{pointerId:2,isPrimary:false}));x.handlers.pointerup(x.event(250,150,100));
 assert.equal(x.renders,0);
 x.swipe(90);
 let prevented=false;x.handlers.click({detail:1,timeStamp:135,pointerId:1,preventDefault(){prevented=true},stopImmediatePropagation(){}});assert.equal(prevented,true);
});
test('short food names retain useful words; full descriptions remain expandable',()=>{
 const code=html.slice(html.indexOf('function foodDisplayName('),html.indexOf('function dayFoods('));
 const c={};runInNewContext(code+';globalThis.name=foodDisplayName',c);
 assert.equal(c.name('Flat white (300 mL, whole milk)'), 'Flat white');
 assert.equal(c.name('Salmon aburi don; left some rice'), 'Salmon aburi don');
 assert.match(c.name('A very long freshly cooked vegetable and rice dinner with multiple side dishes'),/…$/);
 assert.ok(html.includes('details.append(summary,foodEntryDetails(f,interactive))'));
 assert.ok(html.includes("body.append(make('p',food.description),macros)"));
 assert.doesNotMatch(html,/foodCount/);
});


test('release commits an animated preview before the first real next tap and rejects only the swipe click',()=>{
 const x=setup();
 runInNewContext("previewDay=(next)=>{swipePeek={day:next};swipeViewport.classList.add('sliding');swipePreview.hidden=false;return true}",x.c);
 x.handlers.pointerdown(x.event(100,100,0));x.handlers.pointermove(x.event(150,100,50));
 assert.equal(x.classes.has('sliding'),true);
 x.handlers.pointerup(x.event(210,100,100));
 assert.equal(x.date.value,'2026-11-19');
 assert.equal(x.classes.has('sliding'),false);assert.equal(x.preview.hidden,true);
 let swallowed=0;
 const click=(id,time)=>x.handlers.click({detail:1,pointerId:id,timeStamp:time,preventDefault(){swallowed++},stopImmediatePropagation(){}});
 click(1,105);assert.equal(swallowed,1);
 // A new physical touch (even if the UA reuses the pointer ID) isn't that swipe.
 x.handlers.pointerdown(x.event(180,100,110));x.handlers.pointerup(x.event(180,100,118));
 click(1,119);assert.equal(swallowed,1);
 x.swipe(80,0,{pointerId:4});click(3,133);assert.equal(swallowed,1);
 click(4,900);assert.equal(swallowed,1);
});

test('long, slow drags settle on the more visible day in either direction',()=>{
 const x=setup();
 const drag=(dx,end=dx)=>{
  x.handlers.pointerdown(x.event(150,150,0));
  x.handlers.pointermove(x.event(150+dx,151,1400));
  x.handlers.pointerup(x.event(150+end,151,2100));
 };
 drag(220,149);assert.equal(x.date.value,'2026-11-20');
 drag(150);assert.equal(x.date.value,'2026-11-19');
 drag(-220);assert.equal(x.date.value,'2026-11-20');
 drag(-220);assert.equal(x.date.value,'2026-11-20');
 assert.equal(x.renders,2);
});

test('left swipe on a food row reveals Remove without changing the day; right closes it',()=>{
 const x=setup(),button={tabIndex:-1};
 const row={dataset:{},style:{setProperty(){}},querySelector:()=>button};
 const onRow={target:{closest:key=>key==='#foodList > .adaptive-food-row'?row:null}};
 x.swipe(-84,0,onRow);
 assert.equal(row.dataset.foodSwipe,'open');assert.equal(button.tabIndex,0);
 assert.equal(x.date.value,'2026-11-20');assert.equal(x.renders,0);
 x.swipe(86,0,onRow);
 assert.equal(row.dataset.foodSwipe,undefined);assert.equal(button.tabIndex,-1);assert.equal(x.renders,0);
 x.swipe(86,0,onRow);assert.equal(x.date.value,'2026-11-19');
 x.swipe(-84);assert.equal(x.date.value,'2026-11-20');
 x.swipe(-90,160,onRow);assert.equal(row.dataset.foodSwipe,undefined);
});

test('an iPhone-style cancel or stale release keeps Remove open after a deliberate drag',()=>{
 for(const release of ['pointercancel','pointerup']){
  const x=setup(),button={tabIndex:-1},row={dataset:{},style:{setProperty(){}},querySelector:()=>button};
  const onRow={target:{closest:key=>key==='#foodList > .adaptive-food-row'?row:null}};
  x.handlers.pointerdown(x.event(150,150,0,onRow));
  x.handlers.pointermove(x.event(104,151,60,onRow));
  assert.equal(row.dataset.foodSwipe,'drag');
  x.handlers[release](x.event(149,150,130,onRow));
  assert.equal(row.dataset.foodSwipe,'open');assert.equal(button.tabIndex,0);
  assert.equal(x.date.value,'2026-11-20');assert.equal(x.renders,0);
  x.handlers.pointerdown(x.event(140,150,150,onRow));
  x.handlers.pointerup(x.event(140,150,160,onRow));
  let blocked=false;
  x.handlers.click({detail:1,pointerId:1,timeStamp:161,preventDefault(){blocked=true},stopImmediatePropagation(){}});
  assert.equal(blocked,false);
 }
});
test('cancel during a small row nudge never reveals Remove',()=>{
 const x=setup(),row={dataset:{},style:{setProperty(){}},querySelector:()=>({})};
 const onRow={target:{closest:key=>key==='#foodList > .adaptive-food-row'?row:null}};
 x.handlers.pointerdown(x.event(150,150,0,onRow));
 x.handlers.pointermove(x.event(130,150,60,onRow));
 x.handlers.pointercancel(x.event(130,150,130,onRow));
 assert.equal(row.dataset.foodSwipe,undefined);assert.equal(x.renders,0);
});
