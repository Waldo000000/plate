import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {test} from 'node:test';
import assert from 'node:assert/strict';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const dates=html.slice(html.indexOf('const tzDate='),html.indexOf('const dateNum='));
test('Brisbane day changes at 14:00 UTC, independent of machine timezone',()=>{
 const c={};runInNewContext(dates+';globalThis.today=today',c);
 assert.equal(c.today(new Date('2026-11-19T13:59:59Z')),'2026-11-19');
 assert.equal(c.today(new Date('2026-11-19T14:00:00Z')),'2026-11-20');
});
test('rollover follows today without changing food entry draft dates or history',()=>{
 const source=html.slice(html.indexOf('let observedDay=today();'),html.indexOf('setInterval(checkDayRollover'));
 for(const [selected,draft,expected] of [['2026-11-19','','2026-11-20'],['2026-11-19','Dinner','2026-11-19'],['2026-11-18','','2026-11-18']]){
  let day='2026-11-19';const nodes={'#day':{value:selected},'#description':{value:draft},'#kj':{value:''}};
  const c={today:()=>day,$:s=>nodes[s],editId:null,draws(){},drawDay(){}};
  runInNewContext(source+';globalThis.check=checkDayRollover',c);day='2026-11-20';c.check();
  assert.equal(nodes['#day'].value,expected);assert.equal(nodes['#day'].max,day);
 }
});
test('manual completeness removed from UI, while export preserves legacy flags',()=>{
 assert.ok(!html.includes('id="complete"'));assert.ok(!html.includes('$("#complete")'));
 assert.ok(html.includes('day_complete'));
});
