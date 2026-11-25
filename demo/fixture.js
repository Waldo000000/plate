/* Demo-only API adapter. No requests are sent and nothing is persisted. */
(() => {
  'use strict';
  const dayMs = 86_400_000;
  const date = new Intl.DateTimeFormat('en-AU', {timeZone:'Australia/Brisbane',year:'numeric',month:'2-digit',day:'2-digit'});
  const parts = Object.fromEntries(date.formatToParts(new Date()).map(({type,value})=>[type,value]));
  const shot=new URLSearchParams(location.search).get('shot');
  const storyCutoffs=new Map([['track-bulk',-31],['track-cut',-10],['track-fibre',0],['track',0]]);
  const isTrack=storyCutoffs.has(shot);
  const cutoff=storyCutoffs.get(shot)??0;
  const seriesEnd=isTrack?'2026-11-25':[parts.year,parts.month,parts.day].join('-');
  const dayAt = offset => new Date(Date.parse(seriesEnd+'T00:00:00Z') + offset * dayMs).toISOString().slice(0,10);
  const latest=dayAt(cutoff);
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
  if(shot==='next-meal'||isTrack){
    const Clock=window.Date;
    const shotTime=Clock.parse(latest+'T16:45:00+10:00');
    window.Date=class DemoClock extends Clock {
      constructor(...args){super(...(args.length?args:[shotTime]))}
      static now(){return shotTime}
    };
  }
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
  // Fictional 72-day bulk → cut. Recorded weigh-ins, not historical goal lines.
  const trackWeights=[
    [-71,85.6],[-69,86.3],[-67,86.2],[-65,86.7],[-62,86.2],[-59,86.0],
    [-57,86.6],[-55,87.5],[-53,88.0],[-50,87.1],[-48,87.5],[-46,87.3],
    [-43,88.6],[-40,89.0],[-38,88.6],[-36,89.1],[-34,88.6],[-32,89.3],
    [-31,90.0],[-29,89.8],[-27,88.9],[-25,88.4],[-22,88.1],[-20,88.9],
    [-18,88.7],[-16,88.3],[-14,88.4],[-13,87.5],[-11,86.9],[-9,87.2],
    [-8,87.7],[-6,87.3],[-4,86.3],[-2,86.7],[0,86.4]
  ];
  const trackCut=[
    [117,94,52],[110,102,55],[116,99,60],[108,105,55],[113,96,58],
    [105,103,66],[110,100,61],[106,91,64],[109,107,58],[104,98,72],
    [113,101,68],[107,95,69],[103,104,63],[109,100,77],null,
    [104,96,75],[112,105,71],[102,101,82],[106,96,76],[104,108,79],
    [101,101,74],[110,94,86],[105,103,81],[103,98,89],[100,106,79],
    [104,97,87],null,[99,102,95],[103,104,87],[100,98,93]
  ];
  const trackBigDays=new Map([
    [-54,{description:'Pizza and garlic bread • extra shared slices',kj:3250,time:'20:00',macros:{protein_g:21,carbs_g:88,fat_g:34,fibre_g:3},groups:{grains:1850,dairy:550,discretionary:850}}],
    [-12,{description:'Sticky date pudding with ice cream • large restaurant serve',kj:3400,time:'20:15',macros:{protein_g:8,carbs_g:112,fat_g:35,fibre_g:2},groups:{dairy:670,discretionary:2730}}],
  ]);
  const trackPearDays=new Set([-18,-9,-8,-7,-6,-5,-3,-2,-1]);
  const trackPear={description:'Pear • one large',kj:450,time:'15:40',macros:{protein_g:0.7,carbs_g:22,fat_g:0.3,fibre_g:6},groups:{fruit:450}};
  const trackWeightByDay=new Map(trackWeights);
  const dailyVariance=n=>{
    const mixed=Math.imul(n+271,0x45d9f3b);
    return ((mixed^(mixed>>>16))>>>0)%100;
  };
  const trackBulk=t=>{
    if([-63,-48,-37].includes(t))return null;
    return [92+dailyVariance(t*3)%18,91+dailyVariance(t*5)%17,47+dailyVariance(t*7)%24];
  };
  const mealEnergy=meals.reduce((n,dish)=>n+dish.kj,0);
  const mealProtein=meals.reduce((n,dish)=>n+dish.macros.protein_g,0);
  const mealFibre=meals.reduce((n,dish)=>n+dish.macros.fibre_g,0);
  if(shot==='weight'||isTrack)log.settings.weight_goal_kg=cutoff===-31?90:85;
  if(shot==='high-energy')log.settings.food_log_tip_seen=true;
  if(isTrack){
    log.settings.energy_budget_kj=cutoff<-30?10500:7800;
    log.settings.nutrition_target_history=[
      {metric:'energy_budget_kj',effective_day:dayAt(-71),target_value:10500},
      {metric:'energy_budget_kj',effective_day:dayAt(-30),target_value:7800},
      {metric:'fibre_target_g',effective_day:dayAt(-71),target_value:29}
    ].filter(row=>row.effective_day<=latest).sort((a,b)=>a.effective_day.localeCompare(b.effective_day));
  }else log.settings.nutrition_target_legacy={energy_budget_kj:log.settings.energy_budget_kj,fibre_target_g:log.settings.fibre_target_g};
  for(let t=shot==='weight'?-145:isTrack?-71:-34;t<=cutoff;t++) {
    const day=dayAt(t),i=t+34;
    if (shot==='weight') {
      // Uneven fictional gaining and cut phases with pauses, daily variation and missing weigh-ins.
      const d=t+145;
      if(t===0||d===0||(d%7!==6&&(d*17+3)%19<13&&!(d>=43&&d<=47)&&!(d>=94&&d<=98))){
        log.weights.push({day,kg:fictionalWeight(d)});
      }
    } else if(isTrack){
      if(trackWeightByDay.has(t))log.weights.push({day,kg:trackWeightByDay.get(t)});
    } else if(i%8!==3 || t===0) log.weights.push({day,kg:Math.round((70.9-i*.08+Math.sin(i*1.35)*.29+Math.cos(i*.52)*.15)*10)/10});
    if(!isTrack&&(t<-13||t===-6)) continue;
    if(shot==='high-energy'&&t===-5){
      for(const dish of overBudgetMeals)log.food.push(food(dish,day,1));
      log.complete.push(day);
      continue;
    }
    if(isTrack&&t<0){
      const point=t<-30?trackBulk(t):trackCut[t+30];
      if(!point)continue;
      const [budgetPct,proteinPct,fibrePct]=point,budget=t<-30?10500:7800;
      for(const dish of meals){
        const item=food(dish,day,budgetPct*budget/(100*mealEnergy));
        item.nutrition.macros.protein_g=Math.round(dish.macros.protein_g*proteinPct*112/(10*mealProtein))/10;
        item.nutrition.macros.fibre_g=Math.round(dish.macros.fibre_g*fibrePct*29/(10*mealFibre))/10;
        log.food.push(item);
      }
      const extra=trackBigDays.get(t);
      if(extra)log.food.push(food(extra,day,1));
      if(trackPearDays.has(t))log.food.push(food(trackPear,day,1));
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
      if((shot==='next-meal'||isTrack)&&t===0&&m>2)return;
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
