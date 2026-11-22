import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const html=readFileSync('index.html','utf8');
test('inline food comparison tip waits for an eligible opened day, bypasses the guide, and stays dismissed',async()=>{
 const source=html.slice(html.indexOf('let foodLogTipDay='),html.indexOf('function renderFoodTray(open)'));
 const nodes={'#day':{value:'2026-11-22'},'#foodLogTip':{hidden:true,contains:()=>false},'#foodLogTipDone':{}};
 let entries=[{}],calls=0;
 const ctx={document:{activeElement:null},ready:true,firstMealGuide:{},foodTray:{open:true},state:{settings:{}},$:id=>nodes[id],dayFoods:()=>entries,api:async (path,data)=>{
  assert.equal(path,'/api/food-log-tip');assert.equal(data.day,'2026-11-22');calls++;return {show:true,seen:true};
 }};
 runInNewContext(source+';globalThis.tip={maybeOfferFoodLogTip,syncFoodLogTip}',ctx);
 await ctx.tip.maybeOfferFoodLogTip();assert.equal(calls,0);
 ctx.firstMealGuide=null;
 await ctx.tip.maybeOfferFoodLogTip();assert.equal(calls,0);
 entries.push({});
 ctx.firstMealGuide={stage:'finish'};
 await ctx.tip.maybeOfferFoodLogTip();assert.equal(calls,0);
 ctx.firstMealGuide=null;
 await ctx.tip.maybeOfferFoodLogTip();assert.equal(calls,1);assert.equal(nodes['#foodLogTip'].hidden,false);
 nodes['#foodLogTipDone'].onclick();assert.equal(nodes['#foodLogTip'].hidden,true);
 await ctx.tip.maybeOfferFoodLogTip();assert.equal(calls,1);
 assert.match(html,/<h3 id="foodLogTipTitle">Spot what blows your budget<\/h3>/);
 assert.match(html,/if\(open\)void maybeOfferFoodLogTip\(\)/);
});
