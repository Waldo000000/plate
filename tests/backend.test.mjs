import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { handleData } from "../backend.js";

const sqlite = new DatabaseSync(":memory:");
sqlite.exec(readFileSync(new URL("../drizzle/0000_initial.sql", import.meta.url), "utf8"));
// A real legacy row exists before applying the one-column, nullable migration.
sqlite.prepare("INSERT INTO food_entries (user_id,id,day,description,kcal) VALUES (?,?,?,?,?)")
  .run("legacy-reader", "legacy-1", "2026-11-18", "Legacy entry", 220);
sqlite.exec(readFileSync(new URL("../drizzle/0001_food_nutrition.sql", import.meta.url), "utf8"));

sqlite.exec(readFileSync(new URL("../drizzle/0002_user_settings.sql", import.meta.url), "utf8"));

sqlite.exec(readFileSync(new URL("../drizzle/0003_protein_target_history.sql", import.meta.url), "utf8"));

sqlite.exec(readFileSync(new URL("../drizzle/0004_food_consumed_at.sql", import.meta.url), "utf8"));

sqlite.exec(readFileSync(new URL("../drizzle/0005_personal_targets.sql", import.meta.url), "utf8"));

sqlite.exec(readFileSync(new URL("../drizzle/0006_food_chat.sql", import.meta.url), "utf8"));

sqlite.exec(readFileSync(new URL("../drizzle/0007_display_preferences.sql", import.meta.url), "utf8"));
sqlite.exec(readFileSync(new URL("../drizzle/0008_food_log_tip.sql", import.meta.url), "utf8"));
sqlite.exec(readFileSync(new URL("../drizzle/0009_nutrition_target_history.sql", import.meta.url), "utf8"));

const env = { DB: {
  prepare(sql) {
    return {bind(...params) {
      const statement = sqlite.prepare(sql);
      return {sql, first: async () => statement.get(...params) ?? null, all: async () => ({results: statement.all(...params)}), run: async () => ({meta: statement.run(...params)})};
    }};
  },
  async batch(statements) {
    const results=[]; for(const st of statements)results.push(await (st.sql.startsWith("SELECT")?st.all():st.run()));return results;
  },
}};
const API = "https://example.test";
function req(path, {method = "GET", body, user = "fixture-a", origin} = {}) {
  const headers = {};
  if (user) headers["oai-authenticated-user-id"] = user;
  if (body !== undefined) headers["content-type"] = "application/json";
  if (origin) headers.origin = origin;
  return handleData(new Request(API + path, {method, headers, body: body === undefined ? undefined : JSON.stringify(body)}), env);
}
async function body(p, status = 200) { const r = await p; assert.equal(r.status, status); return r.json(); }
const day = "2026-11-18";
const second = "2026-11-19";

assert.equal(await req("/"), null);
const migrated = await body(req("/api/state", {user:"legacy-reader"}));
const [legacyFood]=migrated.food;
assert.deepEqual(migrated.settings,{protein_target_g:null});
assert.ok(Number.isFinite(Date.parse(legacyFood.created_at)));
assert.deepEqual(legacyFood, {id:"legacy-1", day, description:"Legacy entry", kcal:220, created_at:legacyFood.created_at});
assert.equal(sqlite.prepare("SELECT nutrition_json FROM food_entries WHERE user_id = ?").get("legacy-reader").nutrition_json, null);
await body(req("/api/state", {user:null}), 401);
await body(req("/api/weight", {method:"POST", origin:"https://elsewhere.test", body:{day,kg:90}}), 403);
await body(req("/api/weight", {method:"POST", origin:API, body:{day:"2026-02-30",kg:90}}), 400);
await body(req("/api/food", {method:"POST", body:{day,description:"Toast",kcal:220,id:"test-toast"}}));
await body(req("/api/weight", {method:"POST", body:{day,kg:90}}));
const imported = await body(req("/api/weights/import", {method:"POST", body:{weights:[{day,kg:88},{day:second,kg:90.5}]}}));
assert.deepEqual(imported, {ok:true,inserted:1,skipped:1});
await body(req("/api/complete", {method:"POST", body:{day,complete:true}}));
const state = await body(req("/api/state"));
assert.deepEqual(state, {food:[{day,description:"Toast",kcal:220,id:"test-toast",created_at:state.food[0].created_at}],weights:[{day,kg:90},{day:second,kg:90.5}],complete:[day],settings:{protein_target_g:null}});
assert.deepEqual(await body(req("/api/state", {user:"fixture-b"})), {food:[],weights:[],complete:[],settings:{protein_target_g:null}});
assert.deepEqual(await body(req("/api/state?from="+second)), {food:[],weights:[{day:second,kg:90.5}],complete:[],settings:{protein_target_g:null}});

const mcp = (method, params) => body(req("/mcp", {method:"POST",body:{jsonrpc:"2.0",id:1,method,params}}));
const anonRpc = (method, params) => body(req("/mcp", {method:"POST", user:null, body:{jsonrpc:"2.0",id:1,method,params}}));
assert.equal((await anonRpc("tools/list")).result.tools.length, 7);
assert.equal((await anonRpc("tools/call",{name:"read_log"})).result.isError, true);
assert.deepEqual((await mcp("server/discover")).result.supportedVersions, ["2026-07-28"]);
assert.equal((await mcp("tools/list")).result.tools.length, 7);
await mcp("tools/call",{name:"log_food",arguments:{day,description:"Toast + PB",kcal:320,id:"test-toast"}});
const updated = (await mcp("tools/call",{name:"read_log",arguments:{from:day,to:day}})).result.structuredContent;
assert.equal(updated.food.length, 1);
assert.equal(updated.food[0].kcal, 320);
await mcp("tools/call",{name:"log_food",arguments:{day,description:"Label energy",kcal:505 / 4.184,id:"test-kj"}});
const label = (await mcp("tools/call",{name:"read_log",arguments:{from:day,to:day}})).result.structuredContent.food.find(e=>e.id==="test-kj");
assert.equal(Math.round(label.kcal * 4.184), 505);
const nutrition = {groups:{grains:320, protein:180}, macros:{protein_g:15, carbs_g:11.5, fat_g:0,fibre_g:3.2}};
const enriched = await body(req("/api/food", {method:"POST", body:{day,description:"Label energy",kcal:505/4.184,id:"test-kj",nutrition}}));
assert.deepEqual(enriched.nutrition, nutrition);
assert.ok(Number.isFinite(Date.parse(label.created_at)));
assert.equal(enriched.created_at,label.created_at);
assert.deepEqual((await mcp("tools/call",{name:"read_log",arguments:{from:day,to:day}})).result.structuredContent.food.find(e=>e.id==="test-kj").nutrition,nutrition);
const noExtras = await mcp("tools/call",{name:"log_food",arguments:{day,description:"Label energy corrected",kcal:504/4.184,id:"test-kj"}});
assert.deepEqual(noExtras.result.structuredContent.nutrition,nutrition);
assert.equal((await mcp("tools/call",{name:"log_food",arguments:{day,description:"Invalid groups",kcal:501/4.184,id:"test-kj",nutrition:{groups:{grains:501,fruit:1}}}})).result.isError,true);
for (const bad of [{groups:{spurious:1}},{groups:{fruit:-1}},{groups:{dairy:"100"}},{macros:{fat_g:-1}},{macros:{fibre_g:-1}},{macros:{fibre_g:"0"}},{macros:{fake:3}},{groups:null},{unknown:1}]) {
  await body(req("/api/food", {method:"POST",body:{day,description:"Invalid",kcal:505/4.184,id:"test-kj",nutrition:bad}}),400);
}
const reduced = await body(req("/api/food", {method:"POST",body:{day,description:"Label energy reduced",kcal:200/4.184,id:"test-kj"}}));
assert.deepEqual(reduced.nutrition, {macros:nutrition.macros});
const cleared = await body(req("/api/food", {method:"POST",body:{day,description:"Label energy reduced",kcal:200/4.184,id:"test-kj",nutrition:null}}));
assert(!("nutrition" in cleared));
const enrichedMcp = await mcp("tools/call",{name:"log_food",arguments:{day,description:"Label energy",kcal:505/4.184,id:"test-kj",nutrition}});
assert.deepEqual(enrichedMcp.result.structuredContent.nutrition,nutrition);
await body(req("/api/food", {method:"DELETE", body:{id:"test-kj"}}));
await body(req("/api/food", {method:"DELETE", body:{id:"test-toast"}}));
await body(req("/api/food", {method:"POST", body:{day,description:"Toast",kcal:220,id:"test-toast"}}), 409);
assert.deepEqual((await body(req("/api/state"))).food, []);
assert.equal(sqlite.prepare("SELECT deleted FROM food_entries WHERE id=?").get("test-toast").deleted, 1);
console.log("Backend checks passed (synthetic data; in-memory SQLite).");

const originalLog = await body(req("/api/log"));
assert.equal(originalLog.settings.protein_target_g, null);
await body(req("/api/settings", {method:"POST",user:null,body:{protein_target_g:120}}),401);
await body(req("/api/settings", {method:"POST",origin:"https://elsewhere.test",body:{protein_target_g:120}}),403);
for (const invalid of [{},{protein_target_g:0},{protein_target_g:501},{protein_target_g:"120"},{protein_target_g:120,user_id:"fixture-b"}]) {
 await body(req("/api/settings", {method:"POST",body:invalid}),400);
}
await body(req("/api/settings", {method:"POST",body:{protein_target_g:120}}));
assert.equal((await body(req("/api/log"))).settings.protein_target_g,120);
assert.equal((await body(req("/api/state",{user:"fixture-b"}))).settings.protein_target_g,null);
assert.equal((await mcp("tools/call",{name:"read_log"})).result.structuredContent.settings.protein_target_g,120);
await body(req("/api/settings", {method:"POST",body:{protein_target_g:null}}));
const clearedLog = await body(req("/api/log"));
assert.deepEqual(clearedLog.food,originalLog.food);
assert.deepEqual(clearedLog.weights,originalLog.weights);
assert.deepEqual(clearedLog.complete,originalLog.complete);
assert.equal(clearedLog.settings.protein_target_g,null);
assert.equal(clearedLog.settings.protein_target_history.at(-1).target_g,null);
assert.equal((await body(req("/api/log",{user:"fixture-b"}))).settings.protein_target_history,undefined);
await body(req("/api/settings",{method:"POST",user:"history-owner",body:{protein_target_g:150}}));
sqlite.prepare("UPDATE protein_target_history SET effective_day=? WHERE user_id=?").run("2000-01-01","history-owner");
await body(req("/api/settings",{method:"POST",user:"history-owner",body:{protein_target_g:135}}));
assert.deepEqual((await body(req("/api/log",{user:"history-owner"}))).settings.protein_target_history.map(r=>r.target_g),[150,135]);
console.log("Protein settings validated, isolated and cleared without log changes.");
const oilsFood={day,id:'test-oils',description:'Eggs with oil',kcal:219.89,nutrition:{groups:{protein:600,added_fats_oils:320},macros:{fibre_g:0}}};
await body(req('/api/food',{method:'POST',body:oilsFood}));
assert.equal((await body(req('/api/log'))).food.find(f=>f.id==='test-oils').nutrition.groups.added_fats_oils,320);
const toolsList=(await mcp('tools/list',{})).result.tools;
assert.ok(toolsList.find(t=>t.name==='log_food').inputSchema.properties.nutrition.properties.groups.properties.added_fats_oils);
assert.ok(toolsList.find(t=>t.name==='set_protein_target'));
assert.equal((await mcp('tools/call',{name:'set_protein_target',arguments:{protein_target_g:135}})).result.structuredContent.settings.protein_target_g,135);
await mcp('tools/call',{name:'set_protein_target',arguments:{protein_target_g:null}});
assert.equal((await body(req('/api/log'))).settings.protein_target_g,null);

const beforeDelete=await body(req('/api/log'));
const oilBefore=beforeDelete.food.find(f=>f.id==='test-oils');
assert.equal((await anonRpc('tools/call',{name:'delete_food',arguments:{id:'test-oils'}})).result.isError,true);
await body(req('/mcp',{method:'POST',user:'fixture-b',body:{jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'delete_food',arguments:{id:'test-oils'}}}}));
assert.deepEqual(await body(req('/api/log')),beforeDelete);
await mcp('tools/call',{name:'delete_food',arguments:{id:'test-oils'}});
await mcp('tools/call',{name:'delete_food',arguments:{id:'test-oils'}});
const afterDelete=await body(req('/api/log'));
assert.equal(afterDelete.food.some(f=>f.id==='test-oils'),false);
assert.deepEqual(afterDelete.weights,beforeDelete.weights);
assert.equal((await anonRpc('tools/call',{name:'restore_food',arguments:{id:'test-oils'}})).result.isError,true);
const foreignRestore=await body(req('/mcp',{method:'POST',user:'fixture-b',body:{jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'restore_food',arguments:{id:'test-oils'}}}}));
assert.equal(foreignRestore.result.isError,true);
await mcp('tools/call',{name:'restore_food',arguments:{id:'test-oils'}});
await mcp('tools/call',{name:'restore_food',arguments:{id:'test-oils'}});
assert.deepEqual(await body(req('/api/log')),beforeDelete);
console.log('Soft delete/restore preserves complete record, isolates owners and is idempotent.');

const timeEntry={day:second,description:"Timed coffee",kcal:120,id:"timed-coffee"};
const timed=(await mcp("tools/call",{name:"log_food",arguments:{...timeEntry,consumed_at:second+"T04:00:00Z"}})).result.structuredContent;
assert.equal(timed.consumed_at,second+"T04:00:00.000Z");
const revised=await body(req("/api/food",{method:"POST",body:{...timeEntry,description:"Corrected coffee"}}));
assert.equal(revised.consumed_at,timed.consumed_at);
assert.equal(revised.created_at,timed.created_at);
const correction=await body(req("/api/food",{method:"POST",body:{...timeEntry,consumed_at:day+"T14:15:00.3Z"}}));
assert.equal(correction.consumed_at,day+"T14:15:00.300Z");
assert.equal(correction.created_at,timed.created_at);
for(const invalid of [second+"T14:00:00Z", second+"T04:00:00+00:00", second+"T24:00:00Z", "2026-02-30T04:00:00Z", 123]){
 await body(req("/api/food",{method:"POST",body:{...timeEntry,consumed_at:invalid}}),400);
}
assert.equal((await body(req("/api/state?from="+second+"&to="+second))).food.find(f=>f.id===timeEntry.id).consumed_at,correction.consumed_at);
const movedWithoutTime=await body(req("/api/food",{method:"POST",body:{...timeEntry,day}}),400);
assert.match(movedWithoutTime.error,/change this entry’s date/);
assert.equal((await body(req("/api/state?from="+second+"&to="+second))).food.find(f=>f.id===timeEntry.id).consumed_at,correction.consumed_at);
const moved=await body(req("/api/food",{method:"POST",body:{...timeEntry,day,consumed_at:day+"T04:00:00Z"}}));
assert.equal(moved.day,day);assert.equal(moved.consumed_at,day+"T04:00:00.000Z");assert.equal(moved.created_at,timed.created_at);
const noTime=await body(req("/api/food",{method:"POST",body:{...timeEntry,consumed_at:null}}));
assert.equal(noTime.created_at,timed.created_at);assert(!("consumed_at" in noTime));

// Connector clients with a cached schema can pass the exact transport line.
const oldSchema={day:second,description:"Afternoon coffee",kcal:121,id:"legacy-timed"};
const oldCall=argument=>mcp("tools/call",{name:"log_food",arguments:argument});
const oldBefore=(await oldCall(oldSchema)).result.structuredContent;
const withSuffix={...oldSchema,description:oldSchema.description+"\n[consumed_at: "+second+"T04:00:00.000Z]"};
const oldTimed=(await oldCall(withSuffix)).result.structuredContent;
assert.equal(oldTimed.description,oldBefore.description);
assert.equal(oldTimed.created_at,oldBefore.created_at);
assert.equal(oldTimed.kcal,oldBefore.kcal);
assert.equal(oldTimed.consumed_at,second+"T04:00:00.000Z");
assert.deepEqual((await oldCall(oldSchema)).result.structuredContent,oldTimed);
assert.equal((await oldCall({...withSuffix,consumed_at:second+"T05:00:00Z"})).result.structuredContent.consumed_at,second+"T05:00:00.000Z");
assert.equal((await oldCall({...oldSchema,description:oldSchema.description+"\n[consumed_at: "+second+"T14:00:00Z]"})).result.isError,true);
const browserLiteral=await body(req("/api/food",{method:"POST",body:{...withSuffix,id:"http-literal"}}));
assert.equal(browserLiteral.description,withSuffix.description);assert(!("consumed_at" in browserLiteral));

const targets={energy_budget_kj:8600,fibre_target_g:29,weight_goal_kg:84};
await body(req("/api/preferences", {method:"POST",user:null,body:targets}),401);
await body(req("/api/preferences", {method:"POST",user:"targets-a",origin:"https://outside.test",body:targets}),403);
await body(req("/api/preferences", {method:"POST",user:"targets-a",body:{...targets,weight_goal_kg:"84"}}),400);
await body(req("/api/preferences", {method:"POST",user:"targets-a",body:targets}));
const currentBrisbane=new Date(Date.now()+36000000).toISOString().slice(0,10);
assert.deepEqual((await body(req("/api/state",{user:"targets-a"}))).settings,{protein_target_g:null,...targets,nutrition_target_history:[
 {metric:"energy_budget_kj",effective_day:currentBrisbane,target_value:8600},
 {metric:"fibre_target_g",effective_day:currentBrisbane,target_value:29},
]});
assert.deepEqual((await body(req("/api/state",{user:"targets-b"}))).settings,{protein_target_g:null});
await body(req("/api/preferences",{method:"POST",user:"targets-a",body:{energy_budget_kj:null,fibre_target_g:null,weight_goal_kg:null}}));
assert.equal((await body(req("/api/state",{user:"targets-a"}))).settings.energy_budget_kj,null);

// Exercise the Settings HTTP entry point with existing undated values and a
// correction through yesterday, where the restore boundary is today's target.
const targetOwner="target-history-owner", dateOffset=days=>new Date(Date.parse(currentBrisbane)+days*86400000).toISOString().slice(0,10);
const historyState=async user=>(await body(req("/api/state",{user}))).settings;
const legacy={energy_budget_kj:12345,fibre_target_g:28,weight_goal_kg:82};
const seedPrefs=sqlite.prepare("INSERT INTO personal_targets VALUES (?,?,?,?)");
seedPrefs.run(targetOwner,legacy.energy_budget_kj,legacy.fibre_target_g,legacy.weight_goal_kg);
sqlite.prepare("INSERT INTO user_settings (user_id,protein_target_g) VALUES (?,?)").run(targetOwner,141);
assert.deepEqual((await historyState(targetOwner)).nutrition_target_legacy,{energy_budget_kj:12345,fibre_target_g:28});
// A save that only changes weight does not fabricate energy or fibre history.
await body(req("/api/preferences",{method:"POST",user:targetOwner,body:{...legacy,weight_goal_kg:83}}));
assert.equal((await historyState(targetOwner)).nutrition_target_history,undefined);
const targetCorrection={metric:"energy_budget_kj",from:dateOffset(-5),to:dateOffset(-1),value:9012};
const fix=(data,{user=targetOwner,origin=API}={})=>req("/api/target-history",{method:"POST",user,origin,body:data});
await body(fix(targetCorrection,{user:null}),401);
await body(fix(targetCorrection,{origin:"https://outside.test"}),403);
for(const bad of [{to:currentBrisbane},{from:dateOffset(-500)},{from:currentBrisbane},{metric:"weight_goal_kg"},{value:"9012"},{user_id:"targets-b"}])await body(fix({...targetCorrection,...bad}),400);
await body(fix(targetCorrection));
let targetHistory=await historyState(targetOwner);
const datedFor=(state,metric,day)=>state.nutrition_target_history.filter(r=>r.metric===metric&&r.effective_day<=day).at(-1)?.target_value;
assert.equal(datedFor(targetHistory,"energy_budget_kj",dateOffset(-6)),undefined);
for(const offset of [-5,-4,-3,-2,-1])assert.equal(datedFor(targetHistory,"energy_budget_kj",dateOffset(offset)),9012);
assert.equal(datedFor(targetHistory,"energy_budget_kj",currentBrisbane),12345);
assert.deepEqual(targetHistory.nutrition_target_legacy,{fibre_target_g:28});
assert.equal(targetHistory.energy_budget_kj,12345);
assert.equal(targetHistory.protein_target_g,141);
assert.equal(targetHistory.weight_goal_kg,83);
assert.deepEqual(await historyState("targets-b"),{protein_target_g:null});
const earlierSettings=(await body(req("/api/state?to="+dateOffset(-8),{user:targetOwner}))).settings;
assert.equal(earlierSettings.nutrition_target_legacy.energy_budget_kj,undefined);
await body(fix({...targetCorrection,from:dateOffset(-3),to:dateOffset(-2),value:null}));
targetHistory=await historyState(targetOwner);
assert.equal(datedFor(targetHistory,"energy_budget_kj",dateOffset(-4)),9012);
assert.equal(datedFor(targetHistory,"energy_budget_kj",dateOffset(-3)),null);
assert.equal(datedFor(targetHistory,"energy_budget_kj",dateOffset(-2)),null);
assert.equal(datedFor(targetHistory,"energy_budget_kj",dateOffset(-1)),9012);
await body(req("/api/preferences",{method:"POST",user:targetOwner,body:{...legacy,energy_budget_kj:13500,fibre_target_g:null}}));
targetHistory=await historyState(targetOwner);
assert.equal(datedFor(targetHistory,"energy_budget_kj",dateOffset(-1)),9012);
assert.equal(datedFor(targetHistory,"energy_budget_kj",currentBrisbane),13500);
assert.equal(datedFor(targetHistory,"fibre_target_g",currentBrisbane),null);
assert.equal(targetHistory.protein_target_g,141);
await body(fix({...targetCorrection,metric:"protein_target_g",from:dateOffset(-2),to:dateOffset(-1),value:133}));
targetHistory=await historyState(targetOwner);
assert.equal(targetHistory.protein_target_history.find(r=>r.effective_day===dateOffset(-2)).target_g,133);
assert.equal(targetHistory.protein_target_history.find(r=>r.effective_day===currentBrisbane).target_g,141);
assert.equal(targetHistory.protein_target_g,141);

const privateChat="https://chatgpt.com/c/fce2e9a1-828c-4314-a700-bb5d0f51bb2c";
await body(req("/api/food-chat",{method:"POST",user:null,body:{url:privateChat}}),401);
await body(req("/api/food-chat",{method:"POST",origin:"https://outside.test",body:{url:privateChat}}),403);
for(const url of ["https://chatgpt.com/share/public-thread","https://other.test/c/first-thread","https://someone@chatgpt.com/c/first-thread","https://chatgpt.com/","https://chatgpt.com/c/first%2fthread",42]){
 await body(req("/api/food-chat",{method:"POST",user:"private-chat-a",body:{url}}),400);
}
const savedChat=await body(req("/api/food-chat",{method:"POST",user:"private-chat-a",body:{url:privateChat+"?model=example#ignored"}}));
assert.deepEqual(savedChat,{ok:true,food_chat_url:privateChat});
assert.equal((await body(req("/api/state",{user:"private-chat-a"}))).settings.food_chat_url,privateChat);
assert.equal((await body(req("/api/log",{user:"private-chat-a"}))).settings.food_chat_url,undefined);
assert.equal((await body(req("/api/state",{user:"private-chat-b"}))).settings.food_chat_url,undefined);
const privateChat2="https://chatgpt.com/g/g-example-name/c/a0fa7110-dde1-46ff-8245-3c02a6597531";
assert.equal((await body(req("/api/food-chat",{method:"POST",user:"private-chat-a",body:{url:privateChat2}}))).food_chat_url,privateChat2);
await body(req("/api/food-chat",{method:"POST",user:"private-chat-a",body:{url:null}}));
assert.equal((await body(req("/api/state",{user:"private-chat-a"}))).settings.food_chat_url,undefined);

assert.equal((await body(req("/api/state",{user:"private-chat-a"}))).settings.food_chat_ready,true);
assert.equal((await body(req("/api/state",{user:"private-chat-b"}))).settings.food_chat_ready,undefined);

const resetUser="reset-fixture", otherUser="reset-neighbour";
const deletePath="/api/delete-account";
for(const user of [resetUser,otherUser]){
 await body(req("/api/food",{method:"POST",user,body:{day,id:"same-id",description:"Test food",kcal:123}}));
 await body(req("/api/weight",{method:"POST",user,body:{day,kg:80}}));
 await body(req("/api/complete",{method:"POST",user,body:{day,complete:true}}));
 await body(req("/api/preferences",{method:"POST",user,body:{energy_budget_kj:9000,fibre_target_g:30,weight_goal_kg:81,protein_target_g:85}}));
 await body(req("/api/food-chat",{method:"POST",user,body:{url:"https://chatgpt.com/c/sample-chat-12345678"}}));
}
await body(req(deletePath,{method:"POST",user:null,origin:API,body:{confirmation:"DELETE"}}),401);
await body(req(deletePath,{method:"POST",user:resetUser,origin:"https://example.org",body:{confirmation:"DELETE"}}),403);
await body(req(deletePath,{method:"POST",user:resetUser,body:{confirmation:"DELETE"}}),403);
await body(req(deletePath,{method:"POST",user:resetUser,origin:API,body:{confirmation:"delete"}}),400);
await body(req(deletePath,{method:"POST",user:resetUser,origin:API,body:{confirmation:"DELETE",user:otherUser}}),400);
assert.equal((await body(req("/api/state",{user:resetUser}))).settings.protein_target_g,85);
await body(req("/api/food",{method:"DELETE",user:resetUser,origin:API,body:{id:"same-id"}}));
await body(req(deletePath,{method:"POST",user:resetUser,origin:API,body:{confirmation:"DELETE"}}));
assert.deepEqual(await body(req("/api/state",{user:resetUser})),{settings:{protein_target_g:null},food:[],weights:[],complete:[]});
for(const table of ["food_entries","weights","completed_days","user_settings","protein_target_history","personal_targets","nutrition_target_history","food_chat_preferences"]){
 const count=sqlite.prepare("SELECT COUNT(*) AS n FROM "+table+" WHERE user_id=?");
 assert.equal(count.get(resetUser).n,0);
 assert.equal(count.get(otherUser).n,table==="nutrition_target_history"?2:1);
}


const setupTargets={energy_budget_kj:9200,protein_target_g:120,fibre_target_g:30,weight_goal_kg:null};
const setupUser="first-weight-fixture",otherSetupUser="first-weight-other";
const setupDay=sqlite.prepare("SELECT date('now','+10 hours') AS day").get().day;
for(const invalid of [34,251,"75",null]){
 await body(req("/api/preferences",{method:"POST",user:setupUser,body:{...setupTargets,initial_weight_kg:invalid}}),400);
}
assert.deepEqual((await body(req("/api/state",{user:setupUser}))).settings,{protein_target_g:null});
await body(req("/api/preferences",{method:"POST",user:null,body:{...setupTargets,initial_weight_kg:75}}),401);
await body(req("/api/preferences",{method:"POST",user:setupUser,origin:"https://elsewhere.test",body:{...setupTargets,initial_weight_kg:75}}),403);
await body(req("/api/preferences",{method:"POST",user:setupUser,body:{...setupTargets,initial_weight_kg:75.125}}));
let setupState=await body(req("/api/state",{user:setupUser}));
assert.deepEqual(setupState.weights,[{day:setupDay,kg:75.125}]);
assert.equal(setupState.settings.protein_target_g,120);
await body(req("/api/preferences",{method:"POST",user:setupUser,body:{...setupTargets,initial_weight_kg:80}}));
assert.deepEqual((await body(req("/api/state",{user:setupUser}))).weights,setupState.weights);
assert.deepEqual((await body(req("/api/state",{user:otherSetupUser}))).weights,[]);
await body(req("/api/weight",{method:"POST",user:otherSetupUser,body:{day,kg:66}}));
await body(req("/api/preferences",{method:"POST",user:otherSetupUser,body:{...setupTargets,initial_weight_kg:70}}));
assert.deepEqual((await body(req("/api/state",{user:otherSetupUser}))).weights,[{day,kg:66}]);


const prefsPath="/api/display-preferences", unitsUser="unit-preference-fixture";
const units=(options)=>body(req(prefsPath,{method:"POST",user:unitsUser,...options}),options.status??200);
assert.equal((await body(req("/api/state",{user:unitsUser}))).settings.energy_unit,undefined);
await units({user:null,body:{energy_unit:"kcal"},status:401});
await units({origin:"https://elsewhere.test",body:{energy_unit:"kcal"},status:403});
for(const invalid of [{},{energy_unit:"cal"},{energy_unit:"kcal",user_id:"another"}])await units({body:invalid,status:400});
assert.deepEqual(await units({body:{energy_unit:"kcal"}}),{ok:true,energy_unit:"kcal"});
assert.equal((await body(req("/api/state",{user:unitsUser}))).settings.energy_unit,"kcal");
assert.equal((await body(req("/api/state",{user:"other-units"}))).settings.energy_unit,undefined);
await units({body:{energy_unit:"kj"}});
assert.equal((await body(req("/api/state",{user:unitsUser}))).settings.energy_unit,"kj");
await body(req("/api/delete-account",{method:"POST",user:unitsUser,origin:API,body:{confirmation:"DELETE"}}));
assert.equal((await body(req("/api/state",{user:unitsUser}))).settings.energy_unit,undefined);

const tipUser="tip-reader", tipOther="tip-other";
const tip=(user,tipDay=day,origin=API)=>body(req("/api/food-log-tip",{method:"POST",origin,user,body:{day:tipDay}}));
const meal=(user,id,mealDay=day)=>body(req("/api/food",{method:"POST",user,body:{id,day:mealDay,description:"Meal",kcal:220}}));
await meal(tipUser,"tip-meal-first");
await meal(tipUser,"tip-meal-other-day",second);
assert.deepEqual(await tip(tipUser),{show:false,seen:false});
await meal(tipUser,"tip-meal-second");
await body(req("/api/food-log-tip",{method:"POST",origin:"https://outside.test",user:tipUser,body:{day}}),403);
assert.deepEqual(await tip(tipUser),{show:true,seen:true});
assert.deepEqual(await tip(tipUser),{show:false,seen:true});
assert.deepEqual(await tip(tipOther),{show:false,seen:false});
assert.equal((await body(req("/api/state",{user:tipUser}))).settings.food_log_tip_seen,true);
assert.equal((await body(req("/api/log",{user:tipUser}))).settings.food_log_tip_seen,undefined);
await body(req("/api/delete-account",{method:"POST",origin:API,user:tipUser,body:{confirmation:"DELETE"}}));
assert.equal((await body(req("/api/state",{user:tipUser}))).settings.food_log_tip_seen,undefined);

const removeWeightDay='2026-11-27';
await body(req('/api/weight',{method:'POST',user:'weight-delete-owner',origin:API,body:{day:removeWeightDay,kg:84.8}}));
await body(req('/api/weight',{method:'POST',user:'weight-delete-bystander',origin:API,body:{day:removeWeightDay,kg:95}}));
await body(req('/api/weight',{method:'DELETE',user:'weight-nonowner',origin:API,body:{day:removeWeightDay}}),404);
await body(req('/api/weight',{method:'DELETE',user:'weight-delete-owner',origin:'https://unrelated.test',body:{day:removeWeightDay}}),403);
await body(req('/api/weight',{method:'DELETE',user:'weight-delete-owner',origin:API,body:{day:removeWeightDay}}));
assert.deepEqual((await body(req('/api/state',{user:'weight-delete-owner'}))).weights,[]);
assert.deepEqual((await body(req('/api/state',{user:'weight-delete-bystander'}))).weights,[{day:removeWeightDay,kg:95}]);
