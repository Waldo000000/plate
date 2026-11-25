import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const page=readFileSync('index.html','utf8');
test('decorative plate is grouped with the title, not given its own control or grid column',()=>{
 assert.match(page,/<header class="mast"><div class="shell"><h1><svg class="mast-mark"[^>]*aria-hidden="true" focusable="false"[^>]*>[^]*?<\/svg>Plate<\/h1><div class="mast-tools">/);
 assert.match(page,/\.mast \.shell\{display:grid;grid-template-columns:minmax\(0,1fr\) auto/);
 assert.doesNotMatch(page,/\.mast-mark\{display:none/);
});
test('primary log icon keeps its accessible name, button and menu target',()=>{
 assert.match(page,/<button[^>]*id="openLog"[^>]*aria-label="Log"[^>]*aria-controls="logActionMenu"><svg [^>]*aria-hidden="true"/);
 assert.match(page,/\.mast-tools \.mast-log\{[^}]*inline-size:44px[^}]*background:#e0ebd9/);
 assert.match(page,/logMenuButton.onclick=.*setLogMenu/);
});

test('header groups date controls and leaves the tonal action last',()=>{
 const header=page.match(/<header class="mast">([^]*?)<\/header>/)?.[1];
 assert.match(header,/<div class="mast-dates"[^>]*><button[^>]*id="todayButton"[^>]*>Today<\/button><span class="mast-date"><span id="dayLabel" aria-hidden="true">Date<\/span><input[^>]*id="day"[^>]*><\/span><\/div>/);
 assert.ok(header.indexOf('id="day"')<header.indexOf('id="openSettings"'));
 assert.ok(header.indexOf('id="openSettings"')<header.indexOf('id="openLog"'));
 assert.match(page,/\.mast \.settings-cog\{margin:0;border:1px solid var\(--mast-line\);background:var\(--mast-control\)/);
});

test('Today and the date share a type size, including at the mobile focus-zoom threshold',()=>{
 assert.match(page,/\.mast \.mast-dates :is\(\.mast-date,#day,#todayButton\)\{font-size:var\(--mast-control-size\)\}/);
 assert.match(page,/@media \(any-pointer:coarse\),\(max-width:600px\)\{[^]*?\.mast\{--mast-control-size:max\(16px,1rem\)\}/);
});


test('calendar label formats the selected ISO date as day, month, year even if native input order differs',()=>{
 const formatter=page.match(/const dateFullFmt=.*?;/)?.[0];
 const sync=page.match(/function syncMastDate\(\)\{[^}]+\}/)?.[0];
 const picker={value:'2026-02-03'},label={};
 const apply=new Function('$','dateNum',formatter+sync+';return syncMastDate');
 const update=apply(id=>id==='#day'?picker:label,day=>Date.parse(day+'T00:00:00Z'));
 update();assert.equal(label.textContent,'3 Feb 2026');
 picker.value='2026-11-23';update();assert.equal(label.textContent,'23 Nov 2026');
 assert.match(page,/function drawDay\(\)\{\s*updateTodayButton\(\);syncMastDate\(\)/);
 assert.match(page,/#day"\)\.addEventListener\("input",syncMastDate\)/);
 assert.match(page,/\.mast-date\{[^}]*place-items:center;padding-inline:9px/);
});

test('the date chip suppresses its pointer focus flash but restores the outline for keyboard users',()=>{
 const events={};const classes=new Set();
 const picker={addEventListener:(event,handler)=>{events[event]=handler},classList:{add:value=>classes.add(value),remove:value=>classes.delete(value)}};
 const setup=page.slice(page.indexOf('const mastDateInput='),page.indexOf('// Keep the native picker,'));
 new Function('$',setup)(()=>picker);
 events.pointerdown();assert.ok(classes.has('date-pointer-focus'));
 events.keydown();assert.ok(!classes.has('date-pointer-focus'));
 events.pointerdown();events.blur();assert.ok(!classes.has('date-pointer-focus'));
 assert.match(page,/\.mast-date:focus-within:not\(:has\(#day\.date-pointer-focus\)\)\{outline:2px solid #487353/);
});
