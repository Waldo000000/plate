/* Demo-only API adapter. No requests are sent and nothing is persisted. */
(() => {
  'use strict';
  const dayMs = 86_400_000;
  const date = new Intl.DateTimeFormat('en-AU', {timeZone:'Australia/Brisbane',year:'numeric',month:'2-digit',day:'2-digit'});
  const parts = Object.fromEntries(date.formatToParts(new Date()).map(({type,value})=>[type,value]));
  const latest = [parts.year,parts.month,parts.day].join('-');
  const dayAt = offset => new Date(Date.parse(latest+'T00:00:00Z') + offset * dayMs).toISOString().slice(0,10);
  // These dishes, portions, goals and time series are invented for this demo.
  const meals = [
    {description:'Overnight oats • oats, pear and yoghurt',kj:1590,time:'07:35',macros:{protein_g:18,carbs_g:50,fat_g:10,fibre_g:9},groups:{grains:800,fruit:320,dairy:470}},
    {description:'Soy cappuccino • small, no sugar',kj:420,time:'09:15',macros:{protein_g:6,carbs_g:7,fat_g:4,fibre_g:0.8},groups:{dairy:420}},
    {description:'Lentil and pumpkin salad • lentils, roasted pumpkin, feta and dressing',kj:1970,time:'12:25',macros:{protein_g:23,carbs_g:45,fat_g:19,fibre_g:12},groups:{protein:850,vegetables:425,dairy:420,added_fats_oils:275}},
    {description:'Apple • one medium',kj:350,time:'15:00',macros:{protein_g:0.4,carbs_g:18,fat_g:0.3,fibre_g:3.4},groups:{fruit:350}},
    {description:'Miso salmon bowl • salmon, brown rice, edamame and broccolini',kj:2470,time:'18:15',macros:{protein_g:44,carbs_g:51,fat_g:20,fibre_g:9},groups:{protein:1360,grains:680,vegetables:360,added_fats_oils:70}},
  ];
  // Fictional retrospect: per-item macro splits match the energy-sorted mini bars.
  const overBudgetMeals = [
    {description:'Butter croissant • one large',kj:1340,time:'07:45',macros:{protein_g:6,carbs_g:28,fat_g:19,fibre_g:1.6},groups:{grains:650,added_fats_oils:690}},
    {description:'Flat white • 220 mL full-cream milk',kj:590,time:'09:10',macros:{protein_g:7.5,carbs_g:9.5,fat_g:8,fibre_g:0},groups:{dairy:590}},
    {description:'Avocado toast • two slices with avocado',kj:1560,time:'12:30',macros:{protein_g:9,carbs_g:36,fat_g:19,fibre_g:6},groups:{grains:710,vegetables:680,added_fats_oils:170}},
    {description:'Rib fillet • 300 g cooked, visible fat trimmed',kj:2820,time:'18:40',macros:{protein_g:78.5,carbs_g:0,fat_g:40,fibre_g:0},groups:{protein:2820}},
    {description:'Potato gratin • large side',kj:2150,time:'18:45',macros:{protein_g:11,carbs_g:43,fat_g:31,fibre_g:4.5},groups:{vegetables:620,dairy:1100,added_fats_oils:430}},
  ];
  const example = [
    {description:'Tofu soba bowl • estimated one medium bowl',kj:1520,time:'12:25',macros:{protein_g:19,carbs_g:40,fat_g:10,fibre_g:6},groups:{protein:480,grains:710,vegetables:230,added_fats_oils:100}},
    {description:'Mandarin • estimated one medium',kj:160,time:'12:25',macros:{protein_g:0.6,carbs_g:8,fat_g:0.2,fibre_g:1.5},groups:{fruit:160}},
  ];
  const shot=new URLSearchParams(location.search).get('shot');
  const onboarding = new URLSearchParams(location.search).get('onboarding') === '1';
  if(onboarding){
    example.splice(0,example.length,{description:'Tofu soba bowl • fictional serving',kj:2092,macros:{protein_g:24,carbs_g:62,fat_g:16,fibre_g:7},groups:{protein:570,grains:1020,vegetables:282,added_fats_oils:220}});
  }
  let serial = 0;
  const stamp = (day,time) => new Date(day+'T'+time+':00+10:00').toISOString();
  const food = (dish, day, factor) => ({
    id:'fictional-'+(++serial),day,description:dish.description,
    kcal:Math.round(dish.kj*factor/4.184*100)/100,
    created_at:stamp(day,dish.time),consumed_at:stamp(day,dish.time),
    nutrition:{
      macros:Object.fromEntries(Object.entries(dish.macros).map(([k,v])=>[k,Math.round(v*factor*10)/10])),
      groups:Object.fromEntries(Object.entries(dish.groups).map(([k,v])=>[k,Math.floor(v*factor)])),
    },
  });
  const log = {
    settings:{energy_budget_kj:7900,protein_target_g:112,fibre_target_g:29,weight_goal_kg:66},
    food:[],weights:[],complete:[],
  };
  // All scenario values below are invented. No browser profiles or live accounts are read.
  const weightStages = [
    [0,66.4],[11,66.3],[25,67.7],[37,68.1],[49,68.0],[61,70.0],
    [72,70.3],[83,71.6],[92,71.7],[100,73.1],[107,72.9],[116,71.4],
    [126,71.3],[135,70.1],[142,68.7],[145,68.4],
  ];
  const fictionalWeight = d => {
    const before = weightStages.findLast(([day])=>day<=d);
    const after = weightStages.find(([day])=>day>d);
    const middle = after ? before[1] + (after[1]-before[1])*(d-before[0])/(after[0]-before[0]) : before[1];
    const jitter = (Math.sin(d*12.9898+78.233)*43758.5453)%1;
    const bulkCutKg = 85.52 + (middle-66.3)*.62;
    return Math.round((bulkCutKg + .22*Math.sin(d*.97) + .21*Math.sin(d*.31) + .38*jitter)*10)/10;
  };
  // % of budget / protein goal / fibre goal; one genuinely unlogged day.
  const trackRecord = [
    [116,102,43],[112,95,47],[117,107,44],[113,100,53],[109,101,51],
    [111,96,54],[108,104,60],null,[110,97,62],[105,104,57],
    [108,99,67],[102,105,70],[101,96,74],[104,97,78],
  ];
  const mealEnergy=meals.reduce((n,dish)=>n+dish.kj,0);
  const mealProtein=meals.reduce((n,dish)=>n+dish.macros.protein_g,0);
  const mealFibre=meals.reduce((n,dish)=>n+dish.macros.fibre_g,0);
  if(shot==='weight')log.settings.weight_goal_kg=85;
  if(shot==='high-energy')log.settings.food_log_tip_seen=true;
  for(let t=shot==='weight'?-145:-34;t<=0;t++) {
    const day=dayAt(t),i=t+34;
    if (shot==='weight') {
      // Uneven fictional gaining and cut phases with pauses, daily variation and missing weigh-ins.
      const d=t+145;
      if(t===0||d===0||(d%7!==6&&(d*17+3)%19<13&&!(d>=43&&d<=47)&&!(d>=94&&d<=98))){
        log.weights.push({day,kg:fictionalWeight(d)});
      }
    } else if(i%8!==3 || t===0) log.weights.push({day,kg:Math.round((70.9-i*.08+Math.sin(i*1.35)*.29+Math.cos(i*.52)*.15)*10)/10});
    if(t<-13 || t===-6) continue;
    if(shot==='high-energy'&&t===-5){
      for(const dish of overBudgetMeals)log.food.push(food(dish,day,1));
      log.complete.push(day);
      continue;
    }
    if(shot==='nutrition'){
      const point=trackRecord[t+13];
      if(!point)continue;
      const [budgetPct,proteinPct,fibrePct]=point;
      for(const dish of meals){
        const item=food(dish,day,budgetPct*log.settings.energy_budget_kj/(100*mealEnergy));
        item.nutrition.macros.protein_g=Math.round(dish.macros.protein_g*proteinPct*log.settings.protein_target_g/(10*mealProtein))/10;
        item.nutrition.macros.fibre_g=Math.round(dish.macros.fibre_g*fibrePct*log.settings.fibre_target_g/(10*mealFibre))/10;
        log.food.push(item);
      }
      if(t<0)log.complete.push(day);
      continue;
    }
    meals.forEach((dish,m)=>{
      // Vary the nutrition series independently, not only total serving size.
      if(t!==0 && ((i+m*3)%9===0 || (m===3 && i%3===1))) return;
      if(shot==='next-meal'&&t===0&&m>2)return;
      const scale=t===0 ? 1 : 0.9 + .3*(1+Math.sin(i*1.72+m*.82));
      log.food.push(food(dish,day,scale));
    });
    if(t<0) log.complete.push(day);
  }
  if(onboarding){log.settings={};log.food=[];log.weights=[];log.complete=[]}
  function send(data, status=200) {
    return new Response(JSON.stringify(data), {status, headers:{'content-type':'application/json'}});
  }
  window.fetch = async function demoFetch(path, options={}) {
    const url=new URL(path,location.href),method=options.method||'GET';
    if(url.origin!==location.origin || !url.pathname.startsWith('/api/')) return send({error:'Network access is disabled in the demo.'},403);
    if(url.pathname==='/api/state' && method==='GET') return send(log);
    if(method!=='POST') return send({error:'That action is not available in the demo.'},405);
    const payload=JSON.parse(options.body);
    switch(url.pathname) {
      case '/api/preferences': {
        const {initial_weight_kg,...targets}=payload;
        if(initial_weight_kg!==undefined&&!log.weights.length)log.weights.push({day:latest,kg:initial_weight_kg});
        Object.assign(log.settings,targets);
        break;
      }
      case '/api/settings': Object.assign(log.settings,payload); break;
      case '/api/display-preferences':
        if(!['kj','kcal'].includes(payload.energy_unit))return send({error:'Choose kJ or Calories.'},400);
        log.settings.energy_unit=payload.energy_unit;
        return send({ok:true,energy_unit:payload.energy_unit});
      case '/api/food-log-tip': {
        if(log.settings.food_log_tip_seen)return send({show:false,seen:true});
        if(log.food.filter(item=>item.day===payload.day).length<2)return send({show:false,seen:false});
        log.settings.food_log_tip_seen=true;
        return send({show:true,seen:true});
      }
      case '/api/food-chat':
        log.settings.food_chat_ready=true;
        return send({ok:true});
      case '/api/food': {
        const old=log.food.find(item=>item.id===payload.id);
        const id=payload.id??'fictional-'+(++serial);
        const entry={...old,...payload,id,created_at:old?.created_at??new Date().toISOString()};
        log.food=log.food.filter(item=>item.id!==id);
        log.food.push(entry);
        return send(entry);
      }
      case '/api/weight': {
        log.weights=log.weights.filter(item=>item.day!==payload.day);
        log.weights.push(payload);
        break;
      }
      case '/api/weights/import': {
        let inserted=0,skipped=0;
        for(const weight of payload.weights){
          if(log.weights.some(item=>item.day===weight.day))skipped++;
          else {log.weights.push(weight);inserted++}
        }
        return send({inserted,skipped});
      }
      default: return send({error:'That action is not available in the demo.'},404);
    }
    return send({ok:true});
  };
  window.demoMealFragment='#import='+encodeURIComponent(JSON.stringify(example));
  if(new URLSearchParams(location.search).get('example')==='1' && !location.hash){
    history.replaceState(null,'',location.pathname+window.demoMealFragment);
  }
})();
