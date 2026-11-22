import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const page=readFileSync('index.html','utf8');
test('decorative plate is grouped with the title, not given its own control or grid column',()=>{
 assert.match(page,/<header class="mast"><div class="shell"><h1><svg class="mast-mark"[^>]*aria-hidden="true" focusable="false"[^>]*>[^]*?<\/svg>Plate<\/h1><div class="mast-tools">/);
 assert.match(page,/\.mast \.shell\{display:grid;grid-template-columns:minmax\(0,1fr\) auto/);
 assert.doesNotMatch(page,/\.mast-mark\{display:none/);
});
test('primary log icon keeps its accessible name, button and dialog target',()=>{
 assert.match(page,/<button[^>]*id="openLog"[^>]*aria-label="Log"[^>]*aria-haspopup="dialog"><svg [^>]*aria-hidden="true"/);
 assert.match(page,/\.mast-tools \.mast-log\{[^}]*inline-size:44px[^}]*background:#e0ebd9/);
 assert.ok(page.includes("$('#openLog').onclick=()=>openLog();"));
});

test('header groups date controls and leaves the tonal action last',()=>{
 const header=page.match(/<header class="mast">([^]*?)<\/header>/)?.[1];
 assert.match(header,/<div class="mast-dates"[^>]*><button[^>]*id="todayButton"[^>]*>Today<\/button><input[^>]*id="day"[^>]*><\/div>/);
 assert.ok(header.indexOf('id="day"')<header.indexOf('id="openSettings"'));
 assert.ok(header.indexOf('id="openSettings"')<header.indexOf('id="openLog"'));
 assert.match(page,/\.mast \.settings-cog\{margin:0;border:1px solid var\(--mast-line\);background:var\(--mast-control\)/);
});

test('Today and the date share a type size, including at the mobile focus-zoom threshold',()=>{
 assert.match(page,/\.mast \.mast-dates :is\(#day,#todayButton\)\{font-size:var\(--mast-control-size\)\}/);
 assert.match(page,/@media \(any-pointer:coarse\),\(max-width:600px\)\{[^]*?\.mast\{--mast-control-size:max\(16px,1rem\)\}/);
});
