import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const h=readFileSync('index.html','utf8');
test('tray is tap-only with quiet top seam and bottom accessible toggle',()=>{
 assert.match(h,/id="foodTrayToggle" class="food-tray-toggle" aria-controls="foodListCard" aria-expanded="false"/);
 assert.doesNotMatch(h,/foodTrayClose|food-tray-close/);
 assert.match(h,/foodTray.inert=!open/);assert.match(h,/renderFoodTray\(false\)/);
 assert.doesNotMatch(h,/trackTrayGesture|finishTrayGesture|trayGesture|tray-dragging/);
 assert.doesNotMatch(h,/class="food-list-head"|class="food-sort"/);
 assert.match(h,/#dailyLog\{touch-action:pan-y pinch-zoom\}/);
 assert.doesNotMatch(h,/(?:food-tray|day-progress)[^{}]*\{[^{}]*touch-action:pan-x/);
 assert.match(h,/if\(!swipeMotion\?\.matches&&typeof foodTray.animate/);
});
test('sorting uses sibling metric buttons and keeps focus on the same food metric',()=>{
 assert.match(h,/summary.append\(icon,short\)/);
 assert.match(h,/li.append\(details,edit,amount,time\)/);
 assert.match(h,/button.dataset.foodId=f.id/);
 assert.match(h,/b.dataset.foodId===f.id&&b.dataset.foodSort===mode/);
 assert.match(h,/replacement\?\.focus\(\{preventScroll:true\}\)/);
 assert.match(h,/Sort food by energy/);assert.match(h,/Sort food by time/);
 assert.match(h,/Time not recorded/);
});

test('peek clones live shell and uses identical row layout and passive pencil',()=>{
 assert.match(h,/food=\$\('#foodListCard'\).cloneNode\(true\),handle=\$\('#foodTrayToggle'\).cloneNode\(true\)/);
 assert.match(h,/node.removeAttribute\('id'\)/);
 assert.match(h,/if\(food.open\)drawFoodList\(list,items,false\)/);
 assert.match(h,/make\(interactive\?'button':'span',undefined,'food-edit'\)/);
 assert.match(h,/edit.style.visibility=details.open\?'visible':'hidden'/);
 assert.doesNotMatch(h,/make\('button','Edit'/);
 assert.doesNotMatch(h,/macro-legend>summary::after/);
 assert.match(h,/macro-no-key\{padding-right:0\}/);
});

test('peek and live food metrics use the same native button geometry',()=>{
 assert.match(h,/id="swipePreview" inert aria-hidden="true"/);
 assert.match(h,/amount=make\('button',undefined,'food-energy food-sort-metric'\)/);
 assert.match(h,/time=make\('button',[^;]*'food-time food-sort-metric'\)/);
 assert.match(h,/time\.append\(make\('span',.*'food-time-label'\)\)/);
 assert.match(h,/\.food-sort-metric\.food-time\{[^}]*align-items:center;justify-content:flex-end;height:32px;min-height:32px/);
 assert.match(h,/amount\.type=time\.type='button'/);
 assert.doesNotMatch(h,/make\(interactive\?'button':'span',[^;]*food-sort-metric/);
});

test('Food log keeps the same visible name and right-hand chevron when toggled',()=>{
 const toggle=h.match(/<button[^>]*id="foodTrayToggle"[^>]*>(.*?)<\/button>/)?.[1];
 assert.match(toggle??'', /^<span class="tray-label">Food log<\/span><span class="tray-chevron" aria-hidden="true"><\/span>$/);
 assert.doesNotMatch(h,/\.food-tray-toggle[^{}]*\.tray-label\{display:none/);
 assert.doesNotMatch(h,/foodTrayToggle\.setAttribute\('aria-label'/);
 assert.match(h,/foodTrayToggle\.setAttribute\('aria-expanded',String\(open\)\)/);
 assert.match(h,/\.food-tray-toggle\[aria-expanded=true\] \.tray-chevron\{transform:rotate\(225deg\)/);
});


test('the only Food log toggle follows the list and expands, collapses, and reopens it',()=>{
 const trayMarkup=h.match(/<div id="foodListCard".*?aria-expanded="false".*?<\/button>/)?.[0];
 assert.ok(trayMarkup);
 assert.equal([...trayMarkup.matchAll(/<span class="tray-label">Food log<\/span>/g)].length,1);
 assert.match(trayMarkup,/<ul id="foodList"[^>]*><\/ul><\/div><\/div><button type="button" id="foodTrayToggle"/);

 const document={activeElement:null},states={};
 const firstItem={focus:()=>{document.activeElement=firstItem}};
 const tray={
  classList:{toggle:(cls,on)=>{states[cls]=on}},
  setAttribute:(key,value)=>{states[key]=value},
  contains:active=>active===firstItem,
  querySelector:()=>firstItem,
  getBoundingClientRect:()=>({height:tray.open?280:0}),
  addEventListener:(type,handler)=>{tray[type]=handler},
 };
 const toggle={
  setAttribute:(key,value)=>{states[key]=value},
  focus:()=>{document.activeElement=toggle},
 };
 const start=h.indexOf('function renderFoodTray(open)');
 const end=h.indexOf('function animateNutritionExit',start);
 runInNewContext(h.slice(start,end),{document,foodTray:tray,foodTrayToggle:toggle,traySnap:null,foodLogTipDay:null,syncFoodLogTip:()=>{},maybeOfferFoodLogTip:async()=>{},swipeMotion:{matches:true}});
 const expectOpen=open=>{
  assert.equal(tray.open,open);
  assert.equal(tray.inert,!open);
  assert.equal(states.open,open);
  assert.equal(states['aria-hidden'],String(!open));
  assert.equal(states['aria-expanded'],String(open));
 };
 expectOpen(false);
 toggle.onclick({detail:1});expectOpen(true);
 toggle.onclick({detail:1});expectOpen(false);
 toggle.onclick({detail:0});expectOpen(true);assert.equal(document.activeElement,firstItem);
 let escaped=false;
 tray.keydown({key:'Escape',preventDefault:()=>{escaped=true}});
 expectOpen(false);assert.equal(document.activeElement,toggle);assert.equal(escaped,true);
});

test('the anchored ChatGPT action is a native link to the build-specific starter, not another log sheet',()=>{
 const link=h.match(/<a id="logMenuChat"[^>]*>/)?.[0]??'';
 assert.match(link,/target="_blank"/);
 assert.match(link,/rel="noopener noreferrer"/);
 assert.match(h,/logMenuChat\.href=\$\('#plateStarter'\)\.href/);
 assert.doesNotMatch(link,/data-log-action/);
 assert.doesNotMatch(h,/data-log-action="chat"/);
});

test('an empty Food log has exactly one shortcut to the same starter as the plus menu',()=>{
 const make=(tag,text,cls)=>({tag,text,cls,children:[],append(...children){this.children.push(...children)},setAttribute(k,v){this[k]=v}});
 const list=make('ul');list.dataset={};list.replaceChildren=()=>{list.children=[]};
 const source=h.slice(h.indexOf('function drawFoodList('),h.indexOf(' const maxFoodEnergy=Math.max(1,...items.map(toKj));'));
 runInNewContext(source+'}\ndrawFoodList(list,[]);',{list,make,pendingFoodRemoval:null,document:{body:{hasAttribute:()=>false}},foodSort:'time',logMenuChat:{href:'https://example.test/starter'}});
 assert.equal(list.children.length,1);
 const [empty]=list.children;
 assert.equal(empty.children[0].text,'No food logged yet.');
 const [copy,cue]=empty.children[1].children;
 assert.equal(copy.text,'Log food in ChatGPT');
 assert.equal(cue['aria-hidden'],'true');
 assert.equal(empty.children[1].href,'https://example.test/starter');
 assert.equal(empty.children[1].target,'_blank');
});
