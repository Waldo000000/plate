import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const fixture = readFileSync(new URL('../demo/fixture.js', import.meta.url), 'utf8');
async function story(shot) {
  const sandbox = { location: new URL('https://demo.invalid/?shot=' + shot), URL, URLSearchParams, Response };
  sandbox.window = sandbox;
  runInNewContext(fixture, sandbox);
  const response = await sandbox.fetch('/api/state');
  return { day:runInNewContext('new Date().toISOString().slice(0,10)',sandbox), data:await response.json() };
}

test('bulk and cut screenshots are exact chronological prefixes of the same fictional log',async ()=>{
  const [bulk,cut,earlyFibre,pear,finish]=await Promise.all(['track-bulk','track-cut','track-fibre-before','track-pear','track-fibre'].map(story));
  assert.deepEqual(earlyFibre,cut);
  assert.deepEqual(pear,cut);
  const ranked=pear.data.food.filter(row=>row.day==='2026-11-07').sort((a,b)=>b.nutrition.macros.fibre_g-a.nutrition.macros.fibre_g);
  assert.ok(ranked.length>1);
  assert.match(ranked[0].description,/^Pear •/);
  assert.ok(ranked[0].nutrition.macros.fibre_g>ranked[1].nutrition.macros.fibre_g);
  assert.deepEqual([bulk.day,cut.day,finish.day],['2026-10-25','2026-11-15','2026-11-25']);
  for(const { day,data } of [bulk,cut]) {
    for(const key of ['food','weights','complete']) {
      assert.deepEqual(data[key],finish.data[key].filter(row=>(row.day??row)<=day),key+' through '+day);
    }
    assert.deepEqual(data.settings.nutrition_target_history,finish.data.settings.nutrition_target_history.filter(row=>row.effective_day<=day));
  }
  assert.equal(bulk.data.settings.energy_budget_kj,10500);
  assert.equal(cut.data.settings.energy_budget_kj,7800);
  assert.equal(bulk.data.weights.at(-1).kg,90);
  assert.ok(finish.data.food.filter(row=>row.description.startsWith('Pear •')&&row.day>cut.day).length>=6);
});
