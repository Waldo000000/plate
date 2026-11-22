import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const html=readFileSync('index.html','utf8');
const decision=html.slice(html.indexOf('let initialScreenChosen='),html.indexOf('async function loadPlate()'));
const empty={food:[],weights:[],complete:[],settings:{protein_target_g:null}};
function harness(){
 const calls=[];
 const context={openLog:(...args)=>calls.push(args),restoreGuide(){},firstMealGuide:null};
 runInNewContext(decision,context);
 return [context.chooseInitialScreen,calls];
}
test('empty account opens the simplified first-meal screen once',()=>{
 const [choose,calls]=harness();
 choose(empty,false);choose(empty,false);
 assert.deepEqual(calls,[[null,true]]);
 assert.match(html,/first-meal-heading">Log your first meal/);
 assert.match(html,/firstMealScreen\?'Log with voice or a photo':'Log food in ChatGPT'/);
 assert.doesNotMatch(html,/first-meal-intro/);
 assert.match(html,/reply with only this line/);
 assert.match(html,/End the reply at that link. No follow-up offers/);
 assert.match(html,/What did you eat or drink\? Tap the mic to tell me, send a photo, or type it in/);
});
test('empty food log replays onboarding even with other settings; imports and existing food take priority',()=>{
 for(const [data,importReturn,wantsOnboarding] of [
  [empty,true,false],[{...empty,food:[{}]},false,false],[{...empty,weights:[{}]},false,true],
  [{...empty,complete:['2026-11-22']},false,true],[{...empty,settings:{food_chat_ready:true}},false,true],
  [{...empty,settings:{energy_budget_kj:8500}},false,true],
 ]){
  const [choose,calls]=harness();
  choose(data,importReturn);assert.equal(calls.length,Number(wantsOnboarding));
 }
});

test('same-tab sign-in recovery restores a fresh meal once and never overrides a new link',()=>{
 const source=html.slice(html.indexOf('function recoverPendingMeal(){'),html.indexOf('async function loadPlate()'));
 for(const [payload,hash,expected] of [
  [{hash:'#import=meal',expires:Date.now()+10000},'', '/?view=1#import=meal'],
  [{hash:'#import=meal',expires:1},'', undefined],
  [{hash:'#import=old',expires:Date.now()+10000},'#import=fresh',undefined],
  [{hash:'#junk',expires:Date.now()+10000},'',undefined],
 ]){
  let value=JSON.stringify(payload),restored;
  const context={location:{hash,pathname:'/',search:'?view=1'},history:{replaceState(_a,_b,url){restored=url}},
   sessionStorage:{getItem:()=>value,removeItem:()=>{value=null}}};
  runInNewContext(source+';recoverPendingMeal();',context);
  assert.equal(restored,expected);assert.equal(value,null);
 }
});

test('anonymous meal return offers the same-browser route before optional sign-in',()=>{
 const welcome=readFileSync('welcome.html','utf8');
 assert.match(welcome,/Open in browser/);
 assert.match(welcome,/Copy meal link[^]*Sign in here instead/);
 assert.match(welcome,/id="importSignIn" href="\/signin-with-chatgpt\?return_to=%2F"/);
 assert.match(welcome,/sessionStorage.setItem\('plate.pending-meal'/);
});

test('only a newly saved first meal starts the guide, with all relevant saved IDs',()=>{
 const source=html.slice(html.indexOf('function revealSavedFood(draft){'),html.indexOf('function openLog('));
 for(const firstMeal of [true,false]){
  const detail={open:false},row={dataset:{foodId:'saved'},querySelector:()=>detail,
   scrollIntoView({block}){this.block=block},focus({preventScroll}){this.focused=preventScroll}};
  const nodes={'#foodList':{children:[{dataset:{foodId:'older'}},row]},'#day':{value:'2026-11-22'},'#foodSavedText':{},'#foodSavedFeedback':{}};
  const stages=[], context={$:key=>nodes[key],renderFoodTray(value){assert.equal(value,true)},openFoodEntries:new Set(),showGuideStage:stage=>stages.push(stage)};
  runInNewContext(source,context);
  context.revealSavedFood({firstId:'saved',entryIds:['saved','saved2'],firstMeal,total:2});
  assert.equal(detail.open,firstMeal);
  assert.equal(context.openFoodEntries.has('saved'),firstMeal);
  if(firstMeal){
   assert.deepEqual(stages,['meal']);
   assert.equal(JSON.stringify(context.firstMealGuide),'{"stage":"meal","day":"2026-11-22","ids":["saved","saved2"]}');
  }else{assert.deepEqual(stages,[]);assert.equal(row.block,'nearest');assert.equal(row.focused,true);assert.equal(nodes['#foodSavedFeedback'].hidden,false)}
 }
});
test('meal impact uses actual saved entries and keeps unallocated energy visible',()=>{
 const start=html.indexOf('function guideEntries(');
 const end=html.indexOf('function showGuideStage(');
 const source=html.slice(start,end);
 const context={state:{food:[{day:'2026-11-22',id:'meal'},{day:'2026-11-22',id:'unrelated'},{day:'2026-11-21',id:'meal'}]},
  breakdown:(entries,mode)=>{assert.equal(mode,'macros');assert.equal(entries.length,1);assert.equal(entries[0].id,'meal');
   return {total:570,segments:[{key:'fat_g',kj:160},{key:'protein_g',kj:340},{key:'unknown',kj:70}]}}};
 runInNewContext(source,context);
 const actual=context.guideEntries({day:'2026-11-22',ids:['meal']});
 const impact=context.guideImpact(actual);
 assert.equal(impact.total,570);assert.equal(impact.hasMacros,true);
 assert.equal(JSON.stringify(impact.parts.map(p=>p.key)),JSON.stringify(['protein_g','fat_g','unknown']));
 assert.equal(context.hasGuideTargets({weight_goal_kg:85}),false);
 assert.equal(context.hasGuideTargets({fibre_target_g:30}),true);
 assert.match(html,/Next, let’s set your targets so you can see how each meal adds up/);
 assert.doesNotMatch(html,/a macro breakdown wasn’t included/);
 assert.match(html,/Weight recorded:/);
 assert.match(html,/Your track record shows which targets you meet most days/);
});
test('guide mounts at each real feature without rendering for unrelated dates',()=>{
 for(const stage of ['meal','impact','reserve','weight','history','habit','finish'])assert.match(html,new RegExp('id="guide-'+stage+'"[^>]+hidden'));
 assert.match(html,/if\(\$\('#day'\)\.value!==guide\.day\)return/);
 assert.match(html,/sheet\.close\(\);\s+showGuideStage\('reserve'\)/);
 assert.match(html,/firstMealGuide\.weightDay=day;\$\('#logSheet'\)\.close\(\);showGuideStage\('weight-saved'\)/);
 assert.match(html,/sessionStorage\.removeItem\(GUIDE_KEY\)/);
});

test('suggestions calculate adult maintenance, age-sensitive protein and fibre; incomplete and out-of-range profiles are rejected',()=>{
 const source=html.slice(html.indexOf('function suggestedTargets('),html.indexOf("$('#targetEstimateForm').onsubmit"));
 const context={};runInNewContext(source,context);
 const base={age:40,sex:'female',height:165,weight:65,activity:1.6};
 const estimate=context.suggestedTargets(base);
 assert.equal(estimate.energy_budget_kj,8800);
 assert.equal(estimate.protein_target_g,49);assert.equal(estimate.fibre_target_g,25);
 const muscle=context.suggestedTargets({...base,weight:75,proteinGoal:'muscle'});
 const general=context.suggestedTargets({...base,weight:75,proteinGoal:'general'});
 assert.equal(muscle.protein_target_g,120);
 assert.equal(general.protein_target_g,57);
 assert.equal(muscle.energy_budget_kj,general.energy_budget_kj);
 assert.equal(muscle.fibre_target_g,general.fibre_target_g);
 const older=context.suggestedTargets({...base,sex:'male',age:75});
 assert.equal(older.protein_target_g,70);assert.equal(older.fibre_target_g,30);
 for(const extras of [{age:18},{age:79},{height:NaN},{weight:0},{sex:''},{activity:1.2}]){
  assert.equal(context.suggestedTargets({...base,...extras}),null);
 }
});

test('target suggestions replace editable draft values without touching the saved targets or weight goal',()=>{
 const source=html.slice(html.indexOf('function applyTargetSuggestions('),html.indexOf("$('#targetEstimateForm').onsubmit"));
 const context={};context.putEnergyInput=(field,kj)=>{field.value=kj};
 runInNewContext(source,context);
 const saved={energy_budget_kj:10000,protein_target_g:125,fibre_target_g:30,weight_goal_kg:85};
 const fields=Object.fromEntries(Object.entries(saved).map(([key,value])=>[key,{value}]));
 context.applyTargetSuggestions({elements:{namedItem:key=>fields[key]}},{energy_budget_kj:8800,protein_target_g:49,fibre_target_g:25});
 assert.deepEqual(Object.fromEntries(Object.entries(fields).map(([key,field])=>[key,field.value])),
  {energy_budget_kj:8800,protein_target_g:49,fibre_target_g:25,weight_goal_kg:85});
 assert.equal(saved.energy_budget_kj,10000);assert.equal(saved.protein_target_g,125);
});

test('first-run panels advance, allow skips, render real macros, and stay off the wrong date',()=>{
 const source=html.slice(html.indexOf('const GUIDE_KEY='),html.indexOf('function revealSavedFood'));
 const nodes=new Map();
 function node(tag,text,cls){
  return {tag,text,cls,hidden:true,children:[],style:{},setAttribute(){},
   replaceChildren(){this.children=[]},append(...children){this.children.push(...children)},
   focus(){this.didFocus=true},scrollIntoView(){this.didScroll=true}};
 }
 const $=id=>{if(!nodes.has(id))nodes.set(id,node('div'));return nodes.get(id)};
 const active=()=>[...nodes.values()].find(n=>n.tag==='div'&&!n.hidden&&n.children.some(c=>c.tag==='h3'));
 const actions=()=>active().children.at(-1).children;
 $('#day').value='2026-11-22';
 const storage=new Map(),state={food:[{id:'x',day:'2026-11-22',description:'Flat white'}],settings:{},weights:[]};
 let opened=0,weightOpened=0;
 const env={$,state,make:node,document:{querySelector:()=>active()},sessionStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
  breakdown:()=>({total:540,segments:[{key:'protein_g',label:'Protein',kj:119,colour:'red'}]}),
  foodDisplayName:t=>t,showKj:x=>x+' kJ',roundKg:x=>x+' kg',renderFoodTray(){},dateNum:Date.parse,startForRange:()=>0,energyRange:'all',today:()=>'2026-11-22',
  openSettings(){opened++},openLog(){weightOpened++},proteinTargetForDay(_day,settings){return settings.protein_target_g??null},dayFoods:()=>state.food,budgetModel(){return {reserve:680,left:7000}}};
 runInNewContext(source+`;firstMealGuide={stage:'meal',day:'2026-11-22',ids:['x']};showGuideStage('meal')`,env);
 assert.match(active().children[1].text,/Flat white/);
 actions()[0].onclick();
 assert.equal(active().children[0].text,'540 kJ from this meal');
 assert.equal(active().children[2].children[0].children[1].text,'Protein 119 kJ');
 actions()[0].onclick();assert.equal(opened,1);
 actions()[1].onclick();assert.equal(active().children[0].text,'See if your food choices are working');
 env.showGuideStage('reserve');assert.equal(active().children[0].text,'See if your food choices are working');
 state.settings={energy_budget_kj:8500,protein_target_g:110,fibre_target_g:30};env.showGuideStage('reserve');
 assert.equal(active().children[0].text,'Hit your protein target without going over');
 assert.match(active().children[1].text,/highlighted part of your energy budget/);
 actions()[0].onclick();assert.equal(active().children[0].text,'See if your food choices are working');
 actions()[0].onclick();assert.equal(weightOpened,1);
 state.weights=[{day:'2026-11-22',kg:84.2}];state.settings={};
 env.showGuideStage('weight');
 assert.equal(actions()[0].text,'Next');
 assert.equal(weightOpened,1);assert.equal(active().children[0].text,'See if your food choices are working');
 assert.equal(active().children[1].text,'Weight recorded: 84.2 kg. To track progress toward your goal, tap + → Log weight to log it again tomorrow.');
 actions()[0].onclick();assert.equal(active().children[0].text,'Know what to focus on next');
 $('#day').value='2026-11-21';env.paintGuide();assert.equal(active(),undefined);
 $('#day').value='2026-11-22';env.paintGuide();actions()[0].onclick();
 assert.equal(active().children[0].text,'After your next meal');
 assert.match(active().children[1].text,/Tap \+ to log every time you eat/);
 actions()[0].onclick();
 assert.equal(active().children[0].text,'Decide what to eat next');
 assert.equal(active().children[1].children[1].text,'You’re all set!');
 assert.match(active().children[2].text,/check what you’ve had so far/);
 state.settings={energy_budget_kj:8500,protein_target_g:110,fibre_target_g:30};env.paintGuide();
 assert.match(active().children[2].text,/protein and fibre[^]*energy budget/);
 $('#budgetDashboard').querySelector=()=>null;
 actions()[0].onclick();
 assert.equal(active(),undefined);assert.equal(storage.size,0);
});

test('target setup starts with the inputs, with eligibility and sources below',()=>{
 const form=html.slice(html.indexOf('id="targetEstimateForm"'),html.indexOf('id="personalTargets"'));
 assert.match(form,/name="age"[^]*?name="activity"[^]*?For generally healthy adults[^]*?Suggest targets[^]*?Uses <a/);
 assert.match(form,/aria-describedby="activityHelp"/);
 assert.match(form,/brisk walking: you can talk but not sing/);
 assert.match(form,/firstWeightSetupNote[^]*?submitTargetEstimate/);
 assert.doesNotMatch(form.slice(0,form.indexOf('name="age"')),/<p/);
});

test('guided target setup can save the first weight; existing weight and normal Settings stay untouched',async()=>{
 const source=html.slice(html.indexOf('function suggestedTargets('),html.indexOf("const deleteInput="));
 for (const [guided,weights] of [[true,[]],[true,[{day:"2026-11-20",kg:66}]],[false,[]]]){
  const calls=[], inputs={}, sheet={hasAttribute:()=>guided,close(){calls.push('closed')}};
  const nodes={'#appSettings':sheet,'#targetEstimateForm':{},'#personalTargets':{elements:{namedItem:key=>inputs[key]??=( {focus(){calls.push('focused')}} )}},
   '#saveTargetsButton':{},'#targetEstimator':{},'#targetEstimateNote':{},'#guideTargetsNotice':{}};
  const fields={age:'40',sex:'female',height:'165',weight:'65',activity:'1.6',protein_goal:'muscle'};
  const context={$:key=>nodes[key],FormData:class{get(key){return fields[key]}},state:{settings:{weight_goal_kg:62},weights},
   async commit(path,body,_success,_saved,_feedback,after){calls.push([path,JSON.stringify(body)]);after()},
   putEnergyInput(field,kj){field.value=kj},status(){},showGuideStage(stage){calls.push(stage)},setTimeout(){},clearTimeout(){}};
  runInNewContext(source,context);
  await nodes['#targetEstimateForm'].onsubmit({preventDefault(){},currentTarget:{}});
  if(guided){
   assert.equal(calls[0][0],'/api/preferences');
   assert.deepEqual(JSON.parse(calls[0][1]),{energy_budget_kj:8800,protein_target_g:104,fibre_target_g:25,weight_goal_kg:62,...(!weights.length?{initial_weight_kg:65}:{})});
   assert.deepEqual(calls.slice(1),['closed','reserve']);
   assert.equal(nodes['#guideTargetsNotice'].textContent,'Targets set. Change them in Settings.');
   assert.deepEqual(inputs,{});
  }else{
   assert.deepEqual(calls,['focused']);
   assert.equal(inputs.energy_budget_kj.value,8800);
   assert.match(nodes['#targetEstimateNote'].textContent,/won’t change until/);
  }
 }
});

test('the target calculator defaults to muscle building with general health available second',()=>{
 assert.match(html,/<select[^>]*name="protein_goal"><option value="muscle" selected>Build muscle with strength training<\/option><option value="general">General health<\/option><\/select>/);
});
