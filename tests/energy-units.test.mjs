import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {test} from 'node:test';
import assert from 'node:assert/strict';
const html=readFileSync('index.html','utf8');
const source=html.slice(html.indexOf('const KJ_PER_KCAL='),html.indexOf('const svgNS='));
function setup(){
 const budget={value:'',dataset:{}},food={value:'',dataset:{}};
 const nodes={'#personalTargets':{elements:{namedItem:()=>budget}},'#kj':food,'#energyDisplayUnit':{},'#budgetEnergyUnit':{},'#foodEnergyUnit':{}};
 const context={nf:new Intl.NumberFormat('en-AU'),$:(id)=>nodes[id],document:{documentElement:{dataset:{}}}};
 runInNewContext(source+';globalThis.api={applyEnergyPresentation,putEnergyInput,readEnergyInput,showKj,displayEnergyNumber,toKj}',context);
 return {...context.api,nodes,budget,food};
}
test('saved display unit changes formatting, labels and limits without changing stored kJ',()=>{
 const a=setup();
 a.putEnergyInput(a.budget,8500);
 a.putEnergyInput(a.food,540);
 assert.equal(a.showKj(8500),'8,500 kJ');
 a.applyEnergyPresentation('kcal');
 assert.equal(a.showKj(8500),'2,032 kcal');
 assert.equal(a.showKj(540),'129 kcal');
 assert.equal(a.nodes['#budgetEnergyUnit'].textContent,'kcal');
 assert.equal(a.nodes['#foodEnergyUnit'].textContent,'kcal');
 assert.equal(a.food.max,'20000');
 assert.equal(a.readEnergyInput(a.budget),8500);
 assert.equal(a.readEnergyInput(a.food),540);
 a.applyEnergyPresentation('kj');
 assert.equal(a.budget.value,'8500');
 assert.equal(a.food.value,'540');
 assert.equal(a.toKj({kcal:100}),418.40000000000003);
});
test('edited numbers convert exactly once, and empty drafts stay empty',()=>{
 const a=setup();
 a.applyEnergyPresentation('kcal');
 a.food.value='125';
 a.budget.value='2000';
 assert.equal(a.readEnergyInput(a.food),523);
 assert.equal(a.readEnergyInput(a.budget),8368);
 a.applyEnergyPresentation('kj');
 assert.equal(a.food.value,'523');
 assert.equal(a.budget.value,'8368');
 a.putEnergyInput(a.budget,null);
 assert.equal(a.readEnergyInput(a.budget),null);
});
test('dashboard, import review, and nutrition tooltip format energy; API and CSV keep original contracts',()=>{
 assert.match(html,/showKj\(s.total\)\+' eaten/);
 assert.match(html,/showKj\(row.kj\)/);
 assert.match(html,/key==='energy'\?showKj\(raw\)/);
 assert.match(html,/kcal:row.kj\/KJ_PER_KCAL/);
 assert.match(html,/"type","description","kj","kg"/);
});
