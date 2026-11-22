import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const html=readFileSync('index.html','utf8');
const source=html.slice(html.indexOf('// Calendar selection is independent'),html.indexOf('function chartFrame'));
const DAY=86400000, dateNum=s=>Date.parse(s+'T00:00:00Z'),toDay=t=>new Date(t).toISOString().slice(0,10);
class El{
 constructor(tag,text){this.tag=tag;this.textContent=text;this.attrs={};this.children=[];this.events={};this.classes=new Set();this.classList={add:x=>this.classes.add(x),remove:x=>this.classes.delete(x)};this.style={};this.offsetWidth=140;this.offsetHeight=70}
 setAttribute(k,v){this.attrs[k]=v}append(...v){this.children.push(...v)}replaceChildren(...v){this.children=v}insertBefore(v){this.children.unshift(v)}addEventListener(k,v){this.events[k]=v}getBoundingClientRect(){return {left:0,top:0,width:400,height:202}}
}
function setup(){
 const picker={value:'2026-11-19'},listeners={},scrolls=[];let renders=0;
 const c={DAY,dateNum,toDay,ready:true,busy:false,dayFlick:null,clearPeek(){},cancelEdit(){},status(){},updateManualDate(){},drawDay(){renders++},today:()=> '2026-11-20',dateFullFmt:{format:t=>toDay(t)},$:()=>picker,make:(tag,text)=>new El(tag,text),addSvg:(parent,tag,attrs,text)=>{const e=new El(tag,text);e.attrs=attrs;parent.append(e);return e},document:{addEventListener:(k,v)=>listeners[k]=v},window:{scrollBy:({top,behavior})=>scrolls.push([top,behavior])}};
 runInNewContext(source+';globalThis.api={calendarDayAt,selectChartDay,dismissChartValues,wireLinkedChart,getPopup:()=>chartPopup};',c);
 const frame=(start,end)=>({svg:new El('svg'),width:400,left:40,right:10,top:20,bottom:170,x:t=>40+350/((end-start)/DAY+1)*((t-start)/DAY+.5)});
 return {c,picker,listeners,scrolls,frame,api:c.api,get renders(){return renders}};
}
test('hit-testing selects exact calendar dates across gaps, pixel boundaries, single day and All',()=>{
 const {api}=setup(),start=dateNum('2026-11-01'),end=dateNum('2026-11-20');
 assert.equal(api.calendarDayAt(40,40,350,start,end),'2026-11-01');
 assert.equal(api.calendarDayAt(390,40,350,start,end),'2026-11-20');
 assert.equal(api.calendarDayAt(40+350*10.5/20,40,350,start,end),'2026-11-11');
 assert.equal(api.calendarDayAt(100,40,350,end,end),'2026-11-20');
 const old=dateNum('2000-01-01'),span=(end-old)/DAY+1;
 assert.equal(api.calendarDayAt(40+350*(span-4.5)/span,40,350,old,end),'2026-11-16');
});
test('chart tap links picker and both bands, only origin popup, no rebuild, and missing date stays missing',()=>{
 const s=setup(),start=dateNum('2026-11-01'),end=dateNum('2026-11-20'),weight=s.frame(start,end),nutrition=s.frame(end-DAY*2,end),ww=new El('div'),nw=new El('div');
 const queried=[];
 s.api.wireLinkedChart(weight,ww,'weight',start,end,day=>{queried.push(day);return {text:'No weigh-in',points:[]}});
 s.api.wireLinkedChart(nutrition,nw,'nutrition',end-DAY*2,end,()=>({rows:[],points:[]}));
 const oldSvg=weight.svg;
 weight.svg.events.click({clientX:40+350*10.5/20,clientY:100,stopPropagation(){}});
 assert.equal(s.picker.value,'2026-11-11');assert.equal(queried.length,0);assert.equal(s.api.getPopup(),null);
 assert.equal(s.renders,1);assert.equal(weight.svg,oldSvg);assert.equal(ww.children.at(-1).hidden,true);assert.equal(nw.children.at(-1).hidden,true);
 assert.equal(nutrition.svg.children[0].attrs.visibility,'hidden');assert.equal(weight.svg.children[0].attrs.visibility,'visible');
 s.api.dismissChartValues();assert.equal(s.picker.value,'2026-11-11');assert.equal(s.renders,1);assert.equal(ww.children.at(-1).hidden,true);
 s.api.selectChartDay('2026-11-19');assert.equal(nutrition.svg.children[0].attrs.visibility,'visible');assert.equal(s.api.getPopup(),null);
});
test('keyboard moves calendar days and Escape/outside dismissal retain date',()=>{
 const s=setup(),start=dateNum('2026-11-01'),end=dateNum('2026-11-20'),f=s.frame(start,end),wrap=new El('div');
 s.api.wireLinkedChart(f,wrap,'weight',start,end,()=>({text:'86 kg',points:[{y:100,colour:'green'}]}));
 const key=k=>f.svg.events.keydown({key:k,preventDefault(){}});
 key('ArrowLeft');assert.equal(s.picker.value,'2026-11-18');key('Escape');assert.equal(s.picker.value,'2026-11-18');assert.equal(s.api.getPopup(),null);
 key('Enter');assert.equal(s.api.getPopup(),null);s.listeners.click({target:{closest:()=>null}});assert.equal(s.api.getPopup(),null);assert.equal(s.picker.value,'2026-11-18');
});
test('weight selection never opens a tooltip, preserving top-left weight readout',()=>{
 const s=setup(),start=dateNum('2026-11-01'),end=dateNum('2026-11-20'),f=s.frame(start,end),wrap=new El('div');
 s.api.wireLinkedChart(f,wrap,'weight',start,end,()=>({text:'86 kg',points:[]}));
 s.api.selectChartDay('2026-11-18','weight');assert.equal(s.api.getPopup(),null);assert.equal(wrap.children.at(-1).hidden,true);
 f.svg.events.keydown({key:'Enter',preventDefault(){}});assert.equal(s.api.getPopup(),null);
});

test('nutrition keyboard and outside-plot dismissal retain the linked calendar day',()=>{
 const s=setup(),start=dateNum('2026-11-01'),end=dateNum('2026-11-20'),f=s.frame(start,end),wrap=new El('div');
 s.api.wireLinkedChart(f,wrap,'nutrition',start,end,()=>({rows:[{name:'Energy',text:'Not recorded',colour:'gold'}],points:[]}));
 f.svg.events.keydown({key:'ArrowRight',preventDefault(){}});assert.equal(s.picker.value,'2026-11-20');assert.equal(s.api.getPopup(),'nutrition');
 f.svg.events.keydown({key:'Escape',preventDefault(){}});assert.equal(s.picker.value,'2026-11-20');assert.equal(s.api.getPopup(),null);
 f.svg.events.keydown({key:'Enter',preventDefault(){}});assert.equal(s.api.getPopup(),'nutrition');
 f.svg.events.click({clientX:10,clientY:190,stopPropagation(){}});assert.equal(s.picker.value,'2026-11-20');assert.equal(s.api.getPopup(),null);
 assert.match(html,/\.weight-callout\{min-width:0;width:max-content/);
});

test('chart selection compensates for the food list above changing height, in either direction',()=>{
 const s=setup(),y=[230,813,230];const anchor={getBoundingClientRect:()=>({top:y[s.renders]})};
 s.api.selectChartDay('2026-11-20','nutrition',anchor);
 s.api.selectChartDay('2026-11-18','nutrition',anchor);
 s.api.selectChartDay('2026-11-18','nutrition',anchor);
 assert.deepEqual(s.scrolls,[[583,'instant'],[-583,'instant']]);
});
test('pointer focus is quiet; keyboard navigation restores the focus indicator',()=>{
 const s=setup(),start=dateNum('2026-11-01'),end=dateNum('2026-11-20'),f=s.frame(start,end);
 s.api.wireLinkedChart(f,new El('div'),'weight',start,end,()=>({text:'86 kg',points:[]}));
 assert.ok(f.svg.classes.has('linked-chart'));
 f.svg.events.pointerdown();assert.ok(f.svg.classes.has('pointer-focus'));
 f.svg.events.keydown({key:'Enter',preventDefault(){}});assert.ok(!f.svg.classes.has('pointer-focus'));
 f.svg.events.pointerdown();f.svg.events.blur();assert.ok(!f.svg.classes.has('pointer-focus'));
 assert.match(html,/\.linked-chart:focus-visible:not\(\.pointer-focus\)\{outline:2px/);
 assert.match(html,/<header class="mast">.*<h1>.*Plate<\/h1>.*<input[^>]*id="day"[^>]*>.*id="openSettings"/);
});
function chartGestures(kind='nutrition'){
 const s=setup();runInNewContext(html.slice(html.indexOf('// Calendar days, not log entries:'),html.indexOf('function redrawSelectedDay')),s.c);
 s.c.animateCommittedDay=(direction,drag,commit)=>commit();
 const f=s.frame(dateNum('2026-11-01'),dateNum('2026-11-20'));
 s.api.wireLinkedChart(f,new El('div'),kind,dateNum('2026-11-01'),dateNum('2026-11-20'),()=>kind==='weight'?{text:'86 kg',points:[]}:{rows:[],points:[]});
 const event=(x,y,timeStamp,extra={})=>({pointerType:'touch',isPrimary:true,pointerId:1,clientX:x,clientY:y,timeStamp,...extra});
 const flick=(dx,dy=0)=>{f.svg.events.pointerdown(event(200,80,0));f.svg.events.pointermove(event(200+dx/2,80+dy/2,80));f.svg.events.pointerup(event(200+dx,80+dy,160))};
 return {...s,f,event,flick};
}
test('both chart flicks change one shared calendar day without popup or moving SVG; synthetic click suppressed',()=>{
 for(const kind of ['weight','nutrition']){
  const s=chartGestures(kind);s.flick(-80);assert.equal(s.picker.value,'2026-11-20');assert.equal(s.api.getPopup(),null);
  let prevented=false;s.f.svg.events.click({detail:1,stopPropagation(){},preventDefault(){prevented=true}});assert.equal(prevented,true);
  s.flick(-80);assert.equal(s.picker.value,'2026-11-20');s.flick(80);assert.equal(s.picker.value,'2026-11-19');
  assert.equal(s.f.svg.style.transform,undefined);assert.equal(s.f.svg.style.touchAction,'pan-y pinch-zoom');
 }
});
test('chart vertical scroll, cancel and multitouch preserve date; tapping still opens exact date',()=>{
 const s=chartGestures();s.flick(8,110);assert.equal(s.picker.value,'2026-11-19');
 s.f.svg.events.pointerdown(s.event(200,80,0));s.f.svg.events.pointercancel();s.f.svg.events.pointerup(s.event(120,80,160));assert.equal(s.picker.value,'2026-11-19');
 s.f.svg.events.pointerdown(s.event(200,80,0));s.f.svg.events.pointerdown(s.event(200,80,10,{isPrimary:false,pointerId:2}));s.f.svg.events.pointerup(s.event(120,80,160));assert.equal(s.picker.value,'2026-11-19');
 s.f.svg.events.pointerdown(s.event(200,80,0));s.f.svg.events.pointerup(s.event(202,80,100));s.f.svg.events.click({clientX:200,clientY:80,detail:1,stopPropagation(){}});assert.equal(s.picker.value,'2026-11-10');assert.equal(s.api.getPopup(),'nutrition');
});
test('chart flick commits without inert card overlay, first next tap opens chart values',()=>{
 const s=chartGestures();let previews=0;
 s.c.previewDay=()=>{previews++;return true};
 s.flick(-80);assert.equal(s.picker.value,'2026-11-20');assert.equal(previews,0);
 s.f.svg.events.pointerdown(s.event(200,80,161));s.f.svg.events.pointerup(s.event(200,80,165));
 s.f.svg.events.click({clientX:200,clientY:80,detail:1,stopPropagation(){}});
 assert.equal(s.picker.value,'2026-11-10');assert.equal(s.api.getPopup(),'nutrition');
});
test('explicit Today-style cancellation wins over chart pointerup still in flight',()=>{
 const s=chartGestures();s.f.svg.events.pointerdown(s.event(200,80,0));
 s.c.cancelDayNavigation();s.api.selectChartDay('2026-11-20');
 s.f.svg.events.pointerup(s.event(280,80,150));assert.equal(s.picker.value,'2026-11-20');assert.equal(s.api.getPopup(),null);
});
test('gesture-start nutrition anchor survives long-list growth and delayed browser anchoring',()=>{
 const s=setup(),frames=[],moves=[];let top=520;
 const anchor={getBoundingClientRect:()=>({top,bottom:top+202})};
 s.c.window.innerHeight=800;s.c.document.scrollingElement={scrollHeight:1200,clientHeight:800,scrollTop:395};s.c.$=id=>id==='#energyChart'?anchor:s.picker;
 s.c.requestAnimationFrame=fn=>frames.push(fn);s.c.window.scrollBy=({top:delta})=>{moves.push(delta);top-=delta};
 const snapshot=s.c.captureDayScrollAnchor();assert.equal(snapshot.top,520);
 s.c.drawDay=()=>{top+=600};s.api.selectChartDay('2026-11-18',null,snapshot);assert.equal(top,520);assert.deepEqual(moves,[600]);
 top+=40;frames.shift()();assert.equal(top,520);assert.deepEqual(moves,[600,40]);frames.shift()();assert.deepEqual(moves,[600,40]);
 // No adjustment from an obsolete frame after Today/another explicit navigation.
 s.c.restoreDayScrollAnchor(snapshot);s.c.cancelDayNavigation();top+=25;while(frames.length)frames.shift()();assert.equal(top,545);
});
test('only the bottom 24 pixels prioritise nutrition, even when the chart was already visible',()=>{
 const s=setup();s.c.window.innerHeight=800;
 const weights={},scroll={scrollHeight:1200,clientHeight:800,scrollTop:375};
 s.c.document.scrollingElement=scroll;
 const chart={getBoundingClientRect:()=>({top:510,bottom:712})},card={getBoundingClientRect:()=>({top:-120})};
 s.c.$=id=>({'#energyChart':chart,'#dailyLog':card,'#foodListCard':weights}[id]);
 assert.equal(s.c.captureDayScrollAnchor().element,card);
 scroll.scrollTop=376;assert.equal(s.c.captureDayScrollAnchor().element,chart);
 scroll.scrollTop=400;assert.equal(s.c.captureDayScrollAnchor().element,chart);
 assert.match(html,/anchor:captureDayScrollAnchor\(\)/);assert.match(html,/restoreDayScrollAnchor\(start.anchor\)/);
});
test('mid-log swipe caps scroll to keep a shorter food tray in view',()=>{
 const s=setup();let cardTop=-250,trail={top:-95,bottom:240,height:335};
 const card={getBoundingClientRect:()=>({top:cardTop})},tray={open:true,getBoundingClientRect:()=>trail};
 s.c.$=id=>({'#dailyLog':card,'#foodListCard':tray}[id]);
 const snapshot=s.c.captureDayScrollAnchor();
 assert.equal(snapshot.tray,tray);
 trail={top:-95,bottom:-15,height:80};
 s.c.restoreDayScrollAnchor(snapshot);
 assert.deepEqual(s.scrolls,[[-95,'instant']]);
});
