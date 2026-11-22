import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const h=readFileSync('index.html','utf8');
test('tray is tap-only with quiet top seam and bottom accessible toggle',()=>{
 assert.match(h,/id="foodTrayToggle" class="food-tray-toggle" aria-controls="foodListCard" aria-expanded="false"/);
 assert.match(h,/id="foodTrayClose" class="food-tray-close" aria-controls="foodListCard" aria-expanded="true"/);
 assert.match(h,/foodTray.inert=!open/);assert.match(h,/renderFoodTray\(false\)/);
 assert.doesNotMatch(h,/trackTrayGesture|finishTrayGesture|trayGesture|tray-dragging/);
 assert.doesNotMatch(h,/class="food-list-head"|class="food-sort"/);
 assert.match(h,/#dailyLog\{touch-action:pan-y pinch-zoom\}/);
 assert.doesNotMatch(h,/(?:food-tray|day-progress)[^{}]*\{[^{}]*touch-action:pan-x/);
 assert.match(h,/if\(!swipeMotion\?\.matches&&typeof foodTray.animate/);
 assert.match(h,/\.food-tray-close:focus-visible/);
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
 const close=h.match(/<button[^>]*id="foodTrayClose"[^>]*>(.*?)<\/button>/)?.[1];
 assert.equal(close,toggle);
 assert.match(h,/\.food-tray-close \.tray-chevron\{transform:rotate\(225deg\)/);
 assert.match(toggle??'', /^<span class="tray-label">Food log<\/span><span class="tray-chevron" aria-hidden="true"><\/span>$/);
 assert.doesNotMatch(h,/\.food-tray-toggle[^{}]*\.tray-label\{display:none/);
 assert.doesNotMatch(h,/foodTrayToggle\.setAttribute\('aria-label'/);
 assert.match(h,/foodTrayToggle\.setAttribute\('aria-expanded',String\(open\)\)/);
 assert.match(h,/\.food-tray-toggle\[aria-expanded=true\] \.tray-chevron\{transform:rotate\(225deg\)/);
});

test('top and bottom Food log controls share typography and label geometry',()=>{
 assert.match(h,/\.food-tray-close,\.food-tray-toggle,\.food-tray-preview\{[^}]*gap:9px;[^}]*font-size:\.8125rem;line-height:1\.2;color:#46604b\}/);
 assert.match(h,/\.food-tray-close,\.food-tray-toggle,\.food-tray-preview\{[^}]*height:35px;min-height:35px;padding:0;border:0;border-top:1px solid transparent/);
 for(const rule of h.matchAll(/(?<!,)\.food-tray-(?:close|toggle)(?:,\.food-tray-preview)?\{([^}]*)\}/g)){
  assert.doesNotMatch(rule[1],/font-size|line-height|gap:|(?:^|;)height:|min-height:|border-top:|padding:/);
 }
});
