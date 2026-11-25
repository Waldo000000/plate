// Private food log: browser routes and Site MCP use the same owner-scoped store.
const MAX_BODY = 262144;
const MAX_FOOD_KJ = 83680;
const GROUP_KEYS = ["vegetables", "fruit", "grains", "protein", "dairy", "added_fats_oils", "supplements", "discretionary"];
const MACRO_KEYS = ["protein_g", "carbs_g", "fat_g", "fibre_g"];
const KJ_PER_KCAL = 4.184;
const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};

function json(data, status = 200, moreHeaders) {
  return Response.json(data, {status, headers: {...JSON_HEADERS, ...moreHeaders}});
}
class DataError extends Error {
  constructor(message, status = 400) {
    super(message); this.status = status;
  }
}
function fail(message, status) { throw new DataError(message, status); }
function isObject(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }

function validatedDay(day) {
  if (typeof day !== "string" || !/^(?:19|20|21)\d\d-\d\d-\d\d$/.test(day)) fail("Use a real date in YYYY-MM-DD format.");
  const timestamp = Date.parse(day + "T00:00:00Z");
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== day) fail("Use a real date in YYYY-MM-DD format.");
  return day;
}
function validatedId(id) {
  if (typeof id !== "string" || !/^[a-zA-Z0-9_.:-]{1,160}$/.test(id)) fail("Invalid food entry ID.");
  return id;
}
function validatedWeight({day, kg}) {
  if (typeof kg !== "number" || !Number.isFinite(kg) || kg < 20 || kg > 800) fail("Enter a weight between 20 and 800 kg.");
  return {day: validatedDay(day), kg: Math.round(kg * 1000) / 1000};
}

async function input(request) {
  if (!/^application\/json(?:\s*;|\s*$)/i.test(request.headers.get("content-type") || "")) fail("Use application/json.", 415);
  if (Number(request.headers.get("content-length")) > MAX_BODY) fail("Request is too large.", 413);
  const str = await request.text();
  if (str.length > MAX_BODY) fail("Request is too large.", 413);
  let data;
  try {data = JSON.parse(str);} catch {fail("Invalid JSON.");}
  if (!isObject(data)) fail("Send a JSON object.");
  return data;
}
function ensureBrowserOrigin(request) {
  const origin = request.headers.get("origin");
  const site = request.headers.get("sec-fetch-site");
  if ((origin && origin !== new URL(request.url).origin) || site === "cross-site") {
    fail("Only requests from this dashboard may change the log.", 403);
  }
}

function amounts(input, keys, limit, label) {
  if (input === undefined) return undefined;
  if (!isObject(input)) fail(label + " must be an object.");
  const entries = Object.entries(input);
  if (entries.some(([key, value]) => !keys.includes(key) || typeof value !== "number" ||
      !Number.isFinite(value) || value < 0 || value > limit)) {
    fail("Check the " + label.toLowerCase() + " and enter nonnegative numbers with the indicated units.");
  }
  return entries.length ? Object.fromEntries(entries.map(([key, value]) => [key, Math.round(value * 100) / 100])) : undefined;
}
function validatedNutrition(value, kcal) {
  if (value === null) return null;
  if (!isObject(value) || Object.keys(value).some(k => k !== "groups" && k !== "macros")) fail("Nutrition accepts food groups in kJ and macros in grams.");
  const groups = amounts(value.groups, GROUP_KEYS, MAX_FOOD_KJ, "Food groups");
  const macros = amounts(value.macros, MACRO_KEYS, 5000, "Macros");
  if (groups && Object.values(groups).reduce((sum, n) => sum + n, 0) > Math.round(kcal * KJ_PER_KCAL) + 0.011) {
    fail("Food-group energy cannot exceed the entry’s total energy.");
  }
  return groups || macros ? {...(groups && {groups}), ...(macros && {macros})} : null;
}
function validatedConsumedAt(value, day) {
  if (value == null) return null;
  const match = typeof value === "string" && /^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)(?:\.(\d{1,3}))?Z$/.exec(value);
  if (!match) fail("Use a UTC ISO timestamp for consumed_at, ending in Z.");
  const canonical = match[1] + "." + (match[2] || "").padEnd(3,"0") + "Z";
  const timestamp = Date.parse(canonical);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString() !== canonical) fail("Use a real UTC timestamp for consumed_at.");
  if (new Date(timestamp + 36000000).toISOString().slice(0,10) !== day) fail("The consumed time must fall on the log date in Brisbane.");
  return canonical;
}
function foodRecord({nutrition_json, consumed_at, ...food}) {
  if (consumed_at !== null && consumed_at !== undefined) food.consumed_at = consumed_at;
  if (!nutrition_json) return food;
  // If an older client corrects energy without supplying nutrition, hide a
  // now-inconsistent allocation, while retaining independently supplied grams.
  try {
    const nutrition = JSON.parse(nutrition_json);
    if (nutrition.groups && Object.values(nutrition.groups).reduce((sum, n) => sum + n, 0) > Math.round(food.kcal * KJ_PER_KCAL) + 0.011) {
      delete nutrition.groups;
    }
    return Object.keys(nutrition).length ? {...food, nutrition} : food;
  } catch {
    return food;
  }
}

async function readState(db, user, {from, to} = {}) {
  const low = from === undefined ? "1900-01-01" : validatedDay(from);
  const high = to === undefined ? "2199-12-31" : validatedDay(to);
  if (low > high) fail("The start date must not be after the end date.");
  const [foods, weights, completed, settings, history, targets, nutritionHistory] = await db.batch([
    db.prepare("SELECT id, day, description, kcal, created_at, consumed_at, nutrition_json FROM food_entries WHERE user_id=? AND deleted=0 AND day BETWEEN ? AND ? ORDER BY day, COALESCE(consumed_at, created_at), id").bind(user, low, high),
    db.prepare("SELECT day, kg FROM weights WHERE user_id=? AND day BETWEEN ? AND ? ORDER BY day").bind(user, low, high),
    db.prepare("SELECT day FROM completed_days WHERE user_id=? AND day BETWEEN ? AND ? ORDER BY day").bind(user, low, high),
    db.prepare("SELECT protein_target_g FROM user_settings WHERE user_id=?").bind(user),
    db.prepare("SELECT effective_day, target_g FROM protein_target_history WHERE user_id=? AND effective_day<=? ORDER BY effective_day").bind(user, high),
    db.prepare("SELECT energy_budget_kj, fibre_target_g, weight_goal_kg FROM personal_targets WHERE user_id=?").bind(user),
    db.prepare("SELECT metric,effective_day,target_value FROM nutrition_target_history WHERE user_id=? ORDER BY effective_day,metric").bind(user),
  ]);
  const datedTargets=nutritionHistory.results;
  // Undated migrated values keep their legacy display only until that metric
  // establishes a timeline. Do not reuse a newer value before its first date.
  const legacyTargets=Object.fromEntries(nutritionTargetMetrics
    .filter(metric=>targets.results[0]?.[metric]!=null&&!datedTargets.some(r=>r.metric===metric))
    .map(metric=>[metric,targets.results[0][metric]]));
  const visibleDates=datedTargets.filter(r=>r.effective_day<=high);
  return {settings: {...(settings.results[0] ?? {protein_target_g:null}), ...targets.results[0], ...(history.results.length?{protein_target_history:history.results}:{}), ...(visibleDates.length?{nutrition_target_history:visibleDates}:{}), ...(Object.keys(legacyTargets).length?{nutrition_target_legacy:legacyTargets}:{})}, food: foods.results.map(foodRecord), weights: weights.results, complete: completed.results.map(row => row.day)};
}
async function saveSettings(db, user, data) {
  const value = data.protein_target_g;
  if (Object.keys(data).some(key => key !== "protein_target_g") ||
      (value !== null && (typeof value !== "number" || !Number.isFinite(value) || value < 1 || value > 500))) {
    fail("Enter a protein target from 1 to 500 grams, or null to clear it.");
  }
  await db.batch(proteinWrites(db,user,value));
  return {ok:true, settings:{protein_target_g:value}};
}
function seedLegacyProteinTarget(db,user){
  return db.prepare("INSERT OR IGNORE INTO protein_target_history (user_id,effective_day,target_g) SELECT user_id,'1900-01-01',protein_target_g FROM user_settings WHERE user_id=? AND protein_target_g IS NOT NULL AND NOT EXISTS (SELECT 1 FROM protein_target_history WHERE user_id=?)").bind(user,user);
}
function proteinWrites(db,user,value){
  return [
    seedLegacyProteinTarget(db,user),
    db.prepare("INSERT INTO protein_target_history (user_id,effective_day,target_g) SELECT ?,date('now','+10 hours'),? WHERE ? IS NOT (SELECT protein_target_g FROM user_settings WHERE user_id=?) ON CONFLICT(user_id,effective_day) DO UPDATE SET target_g=excluded.target_g").bind(user,value,value,user),
    db.prepare("INSERT INTO user_settings (user_id,protein_target_g) VALUES (?,?) ON CONFLICT(user_id) DO UPDATE SET protein_target_g=excluded.protein_target_g").bind(user, value),
  ];
}
const preferenceLimits={energy_budget_kj:[1,50000],fibre_target_g:[1,150],weight_goal_kg:[20,800]};
const nutritionTargetMetrics=["energy_budget_kj","fibre_target_g"];
// An undated legacy value is the baseline across the supported range until a dated edit.
const nutritionHistoryStart="1900-01-01";
const localDay=()=>new Date(Date.now()+36000000).toISOString().slice(0,10);

function seedLegacyNutritionTarget(db,user,metric,onlyIfChanged=false,value=null) {
  // The column name comes from the fixed metric allowlist.
  return db.prepare(`INSERT INTO nutrition_target_history (user_id,metric,effective_day,target_value)
    SELECT user_id,?,?,${metric} FROM personal_targets WHERE user_id=? AND ${metric} IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM nutrition_target_history WHERE user_id=? AND metric=? AND effective_day>=?)
    AND (?=0 OR ${metric} IS NOT ?)`)
    .bind(metric,nutritionHistoryStart,user,user,metric,nutritionHistoryStart,Number(onlyIfChanged),value);
}
function nutritionTargetWrite(db,user,metric,day,value) {
  return db.prepare("INSERT INTO nutrition_target_history (user_id,metric,effective_day,target_value) VALUES (?,?,?,?) ON CONFLICT(user_id,metric,effective_day) DO UPDATE SET target_value=excluded.target_value")
    .bind(user,metric,day,value);
}
async function saveNutritionTargetCorrection(db,user,data) {
  const {metric,value,from,to}=data;
  const protein=metric==="protein_target_g";
  if(Object.keys(data).length!==4||(!protein&&!nutritionTargetMetrics.includes(metric)))fail("Choose an energy, protein or fibre target.");
  const [min,max]=protein?[1,500]:preferenceLimits[metric];
  if(value!==null&&(!Number.isFinite(value)||value<min||value>max))fail("The target is out of range.");
  const first=validatedDay(from),last=validatedDay(to);
  const span=(Date.parse(last)-Date.parse(first))/86400000;
  if(span<0||span>365||last>=localDay())fail("Choose up to 366 past days, ending before today.");
  const next=new Date(Date.parse(last)+86400000).toISOString().slice(0,10);
  if(protein){
    await db.batch([
      seedLegacyProteinTarget(db,user),
      db.prepare(`INSERT OR IGNORE INTO protein_target_history (user_id,effective_day,target_g) VALUES (?,?,(
        SELECT target_g FROM protein_target_history WHERE user_id=? AND effective_day<=? ORDER BY effective_day DESC LIMIT 1))`)
        .bind(user,next,user,next),
      db.prepare("DELETE FROM protein_target_history WHERE user_id=? AND effective_day BETWEEN ? AND ?").bind(user,first,last),
      db.prepare("INSERT INTO protein_target_history (user_id,effective_day,target_g) VALUES (?,?,?)").bind(user,first,value),
    ]);
    return {ok:true};
  }
  await db.batch([
    seedLegacyNutritionTarget(db,user,metric),
    // Restore the previously applicable value just outside the edit, including null.
    db.prepare(`INSERT OR IGNORE INTO nutrition_target_history (user_id,metric,effective_day,target_value) VALUES (?,?,?,(
      SELECT target_value FROM nutrition_target_history WHERE user_id=? AND metric=? AND effective_day<=? ORDER BY effective_day DESC LIMIT 1))`)
      .bind(user,metric,next,user,metric,next),
    db.prepare("DELETE FROM nutrition_target_history WHERE user_id=? AND metric=? AND effective_day BETWEEN ? AND ?").bind(user,metric,first,last),
    nutritionTargetWrite(db,user,metric,first,value),
  ]);
  return {ok:true};
}
async function savePreferences(db,user,data){
  const keys=Object.keys(preferenceLimits);
  const hasProtein=Object.hasOwn(data,"protein_target_g"), protein=data.protein_target_g;
  const hasInitialWeight=Object.hasOwn(data,"initial_weight_kg");
  const initialWeight=data.initial_weight_kg;
  if(hasInitialWeight&&(!Number.isFinite(initialWeight)||initialWeight<35||initialWeight>250))fail("Enter a starting weight from 35 to 250 kg.");
  if(Object.keys(data).length!==keys.length+Number(hasProtein)+Number(hasInitialWeight)||keys.some(key=>!Object.hasOwn(data,key)))fail("Supply all optional targets.");
  if(hasProtein&&protein!==null&&(!Number.isFinite(protein)||protein<1||protein>500))fail("Protein target is out of range.");
  for(const key of keys){const v=data[key],[min,max]=preferenceLimits[key];if(v!==null&&(!Number.isFinite(v)||v<min||v>max))fail("One or more targets are out of range.");}
  const prefs=db.prepare("INSERT INTO personal_targets (user_id,energy_budget_kj,fibre_target_g,weight_goal_kg) VALUES (?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET energy_budget_kj=excluded.energy_budget_kj,fibre_target_g=excluded.fibre_target_g,weight_goal_kg=excluded.weight_goal_kg")
    .bind(user,...keys.map(k=>data[k]));
  const day=localDay();
  const writes=nutritionTargetMetrics.flatMap(metric=>[
    seedLegacyNutritionTarget(db,user,metric,true,data[metric]),
    db.prepare(`INSERT INTO nutrition_target_history (user_id,metric,effective_day,target_value)
      SELECT ?,?,?,? WHERE ? IS NOT (SELECT ${metric} FROM personal_targets WHERE user_id=?)
      ON CONFLICT(user_id,metric,effective_day) DO UPDATE SET target_value=excluded.target_value`)
      .bind(user,metric,day,data[metric],data[metric],user),
  ]);
  writes.push(prefs);
  if(hasProtein)writes.push(...proteinWrites(db,user,protein));
  if(hasInitialWeight)writes.push(db.prepare("INSERT OR IGNORE INTO weights (user_id,day,kg) SELECT ?,date('now','+10 hours'),? WHERE NOT EXISTS (SELECT 1 FROM weights WHERE user_id=?)")
    .bind(user,Math.round(initialWeight*1000)/1000,user));
  await db.batch(writes);
  return {ok:true};
}
async function deletePlateAccount(db,user,data){
  if(Object.keys(data).length!==1||data.confirmation!=="DELETE")fail("Type DELETE to confirm.");
  const tables=["food_entries","weights","completed_days","user_settings","protein_target_history","personal_targets","nutrition_target_history","food_chat_preferences","display_preferences","food_log_tip_seen"];
  await db.batch(tables.map(table=>db.prepare("DELETE FROM "+table+" WHERE user_id=?").bind(user)));
  return {ok:true};
}
async function claimFoodLogTip(db,user,data){
  if(Object.keys(data).length!==1)fail("Choose a food log date.");
  const day=validatedDay(data.day);
  const awarded=await db.prepare("INSERT OR IGNORE INTO food_log_tip_seen (user_id) SELECT ? WHERE 2=(SELECT count(*) FROM (SELECT 1 FROM food_entries WHERE user_id=? AND day=? AND deleted=0 LIMIT 2)) RETURNING 1 AS seen").bind(user,user,day).first();
  if(awarded)return {show:true,seen:true};
  const prior=await db.prepare("SELECT 1 AS seen FROM food_log_tip_seen WHERE user_id=?").bind(user).first();
  return {show:false,seen:!!prior};
}
async function saveDisplayPreferences(db,user,data){
  if(Object.keys(data).length!==1||!['kj','kcal'].includes(data.energy_unit))fail("Choose kJ or Calories.");
  const {energy_unit}=data;
  await db.prepare("INSERT INTO display_preferences (user_id,energy_unit) VALUES (?,?) ON CONFLICT(user_id) DO UPDATE SET energy_unit=excluded.energy_unit").bind(user,energy_unit).run();
  return {ok:true,energy_unit};
}
function foodChatUrl(raw){
  if(typeof raw!=="string"||raw.length>1024)fail("Paste the address of a private ChatGPT conversation.");
  let u;
  try{u=new URL(raw.trim());}catch{fail("Paste the address of a private ChatGPT conversation.");}
  if(u.origin!=="https://chatgpt.com"||u.username||u.password||!/^\/(?:g\/g-[a-z0-9-]{1,100}\/)?c\/[a-z0-9-]{8,100}\/?$/i.test(u.pathname))fail("Use a private ChatGPT conversation address, not a public share link.");
  return u.origin+u.pathname.replace(/\/$/,"");
}
async function saveFoodChat(db,user,data){
  if(Object.keys(data).length!==1||!Object.hasOwn(data,"url"))fail("Supply a conversation URL or null.");
  const url=data.url===null?null:foodChatUrl(data.url);
  await db.prepare("INSERT INTO food_chat_preferences (user_id,conversation_url) VALUES (?,?) ON CONFLICT(user_id) DO UPDATE SET conversation_url=excluded.conversation_url").bind(user,url).run();
  return {ok:true,food_chat_url:url};
}
async function logFood(db, user, {day, description, kcal, id, nutrition, consumed_at}) {
  day = validatedDay(day);
  if (typeof description !== "string" || description.trim().length === 0 || description.trim().length > 400) fail("Enter a food description of 1–400 characters.");
  description = description.trim();
  if (typeof kcal !== "number" || !Number.isFinite(kcal) || kcal < 0 || kcal > 20000) fail("Enter an energy amount between 0 and 83,680 kJ.");
  // Keep existing rows/API compatible while preserving a kJ label to the whole kJ.
  kcal = Math.round(kcal * 100) / 100;
  id = id === undefined ? crypto.randomUUID() : validatedId(id);
  const replaceTime = consumed_at !== undefined;
  const consumed = validatedConsumedAt(consumed_at, day);
  const replaceNutrition = nutrition !== undefined;
  const validated = replaceNutrition ? validatedNutrition(nutrition, kcal) : null;
  const record = await db.prepare(
    "INSERT INTO food_entries (user_id,id,day,description,kcal,nutrition_json,consumed_at) VALUES (?,?,?,?,?,?,?) " +
    "ON CONFLICT(user_id,id) DO UPDATE SET day=excluded.day, description=excluded.description, kcal=excluded.kcal, " +
    "nutrition_json=CASE WHEN ? THEN excluded.nutrition_json ELSE food_entries.nutrition_json END, " +
    "consumed_at=CASE WHEN ? THEN excluded.consumed_at ELSE food_entries.consumed_at END " +
    "WHERE food_entries.deleted=0 AND (? OR food_entries.consumed_at IS NULL OR food_entries.day=excluded.day) RETURNING id,day,description,kcal,created_at,consumed_at,nutrition_json"
  ).bind(user, id, day, description, kcal, validated ? JSON.stringify(validated) : null, consumed, Number(replaceNutrition), Number(replaceTime), Number(replaceTime)).first();
  if (!record) {
    const prior = await db.prepare("SELECT deleted FROM food_entries WHERE user_id=? AND id=?").bind(user,id).first();
    if (prior && !prior.deleted) fail("To change this entry’s date, also supply the consumed time for the new date or clear it.");
    fail("This entry was removed. Add it as a new entry instead.", 409);
  }
  return {ok: true, ...foodRecord(record)};
}
async function deleteFood(db, user, {id}) {
  id = validatedId(id);
  await db.prepare("UPDATE food_entries SET deleted=1 WHERE user_id=? AND id=? AND deleted=0").bind(user, id).run();
  return {ok: true};
}
async function restoreFood(db, user, {id}) {
  id = validatedId(id);
  const row = await db.prepare("SELECT id FROM food_entries WHERE user_id=? AND id=?").bind(user,id).first();
  if (!row) fail("Food entry not found.",404);
  await db.prepare("UPDATE food_entries SET deleted=0 WHERE user_id=? AND id=? AND deleted=1").bind(user,id).run();
  return {ok:true,id};
}
async function logWeight(db, user, input) {
  const {day, kg} = validatedWeight(input);
  await db.prepare("INSERT INTO weights (user_id,day,kg) VALUES (?,?,?) ON CONFLICT(user_id,day) DO UPDATE SET kg=excluded.kg").bind(user, day, kg).run();
  return {ok: true, day, kg};
}
async function importWeights(db, user, {weights}) {
  if (!Array.isArray(weights) || weights.length < 1 || weights.length > 50 || weights.some(w => !isObject(w))) fail("Send between 1 and 50 dated weight readings.");
  const distinct = new Map(weights.map(w => {
    const {day, kg} = validatedWeight(w);
    return [day, kg];
  }));
  const results = await db.batch([...distinct].map(([day, kg]) =>
    db.prepare("INSERT INTO weights (user_id,day,kg) VALUES (?,?,?) ON CONFLICT(user_id,day) DO NOTHING").bind(user, day, kg)
  ));
  const inserted = results.reduce((sum, row) => sum + row.meta.changes, 0);
  return {ok: true, inserted, skipped: weights.length - inserted};
}
async function markComplete(db, user, {day, complete}) {
  day = validatedDay(day);
  if (typeof complete !== "boolean") fail("Set complete to true or false.");
  if (complete) {
    await db.prepare("INSERT INTO completed_days (user_id,day) VALUES (?,?) ON CONFLICT(user_id,day) DO NOTHING").bind(user, day).run();
  } else {
    await db.prepare("DELETE FROM completed_days WHERE user_id=? AND day=?").bind(user, day).run();
  }
  return {ok: true, day, complete};
}

const daySchema = {type: "string", format: "date", description: "Calendar date in Brisbane (YYYY-MM-DD)."};
function mcpTool(name, description, properties, required, annotations) {
  return {name, description, inputSchema: {type: "object", properties, required, additionalProperties: false}, annotations};
}
const nutritionAmountsSchema = (keys, max, description) => ({
  type: "object", description, additionalProperties: false,
  properties: Object.fromEntries(keys.map(key => [key, {type: "number", minimum: 0, maximum: max}])),
});
const nutritionSchema = {
  type: ["object", "null"],
  description: "Optional breakdown. Omit unknown fields (do not turn unknowns into zero). Omit nutrition to keep prior breakdown; null explicitly clears it.",
  additionalProperties: false,
  properties: {
    groups: nutritionAmountsSchema(GROUP_KEYS, MAX_FOOD_KJ, "Energy attributed to each food group, in kJ. Mixed meals can have several groups. Do not allocate more than the entry’s total energy; leave unknown energy unclassified."),
    macros: nutritionAmountsSchema(MACRO_KEYS, 5000, "Grams of protein, available carbohydrate, fat and dietary fibre. Fibre is separate from available carbohydrate; labelled total energy already includes it. Supply known values or defensible estimates only."),
  },
};
const siteTools = [
  mcpTool("delete_food", "Soft-delete one owner's food entry by exact ID, only when explicitly requested. Retains the complete record for restore_food; does not delete weight readings or other foods.", {id:{type:"string",pattern:"^[a-zA-Z0-9_.:-]{1,160}$"}}, ["id"], {readOnlyHint:false,destructiveHint:true,idempotentHint:true,openWorldHint:false}),
  mcpTool("restore_food", "Restore a previously soft-deleted food entry by exact ID for the signed-in owner. Restores its original date, description, energy and nutrition without creating a duplicate.", {id:{type:"string",pattern:"^[a-zA-Z0-9_.:-]{1,160}$"}}, ["id"], {readOnlyHint:false,destructiveHint:false,idempotentHint:true,openWorldHint:false}),
  mcpTool("set_protein_target", "Set or clear the owner's explicitly chosen daily protein target in grams. Pass null to remove the target. Never infer a target from a read or silently set a default.", {
    protein_target_g: {type:["number","null"],minimum:1,maximum:500},
  }, ["protein_target_g"], {readOnlyHint:false,destructiveHint:false,idempotentHint:true,openWorldHint:false}),
  mcpTool("read_log", "Read the owner's private food, weight and completed-day log. For usual summaries, request the needed date range rather than all history.", {
    from: daySchema, to: daySchema,
  }, [], {readOnlyHint: true, openWorldHint: false}),
  mcpTool("log_food", "Save food and its energy for the owner. The owner prefers kJ: divide kJ by 4.184 for this legacy kcal field, without rounding to whole kcal. Use the owner's explicit logging request and a repeatable ID such as the originating message ID plus an item suffix, so a retry cannot create a duplicate.", {
    day: daySchema, description: {type: "string", minLength: 1, maxLength: 400}, kcal: {type: "number", minimum: 0, maximum: 20000}, id: {type: "string", pattern: "^[a-zA-Z0-9_.:-]{1,160}$"}, nutrition: nutritionSchema,
    consumed_at: {type: ["string","null"], description: "Optional known consumption timestamp, in UTC ISO format ending in Z. Must fall on day in Brisbane. Omit if unknown or to keep prior time. When moving a timed entry to another date, supply the new time or null to clear. Never invent a time."},
  }, ["day", "description", "kcal", "id"], {readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false}),
  mcpTool("log_weight", "Save or correct a dated weight reading in kg for the owner. Replaces a previous reading on this date.", {
    day: daySchema, kg: {type: "number", minimum: 20, maximum: 800},
  }, ["day", "kg"], {readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false}),
  mcpTool("set_day_complete", "Set whether a date's food diary is complete. Do not mark a partial or unlogged day complete unless the owner says it is complete.", {
    day: daySchema, complete: {type: "boolean"},
  }, ["day", "complete"], {readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false}),
];
const metadata = {
  capabilities: {tools: {}},
  serverInfo: {name: "food-and-weight-log", version: "1.0.0"},
};
const VERSION = "2026-07-28";
function rpcResult(id, result) { return json({jsonrpc: "2.0", id, result}); }
function rpcError(id, code, message) { return json({jsonrpc: "2.0", id, error: {code, message}}); }

async function handleMcp(request, db, user) {
  let rpc;
  try {rpc = await input(request);} catch (error) {return rpcError(null, -32700, error instanceof DataError ? error.message : "Parse error.");}
  const id = rpc.id ?? null;
  if (rpc.jsonrpc !== "2.0" || typeof rpc.method !== "string") return rpcError(id, -32600, "Invalid JSON-RPC request.");
  if (rpc.method === "server/discover") return rpcResult(id, {supportedVersions: [VERSION], capabilities: metadata.capabilities});
  if (rpc.method === "initialize") {
    const protocolVersion = ["2024-11-05", "2025-03-26", "2025-06-18", "2025-11-25", VERSION].includes(rpc.params?.protocolVersion) ? rpc.params.protocolVersion : VERSION;
    return rpcResult(id, {...metadata, protocolVersion});
  }
  if (id === null && rpc.method.startsWith("notifications/")) return new Response(null, {status: 202});
  if (rpc.method === "ping") return rpcResult(id, {});
  if (rpc.method === "tools/list") return rpcResult(id, {tools: siteTools});
  if (rpc.method !== "tools/call") return rpcError(id, -32601, "Method not found.");
  if (!user || !db) return rpcResult(id, {isError: true, content: [{type: "text", text: !user ? "Connect using your signed-in ChatGPT account." : "The log is temporarily unavailable."}]});
  const params = rpc.params?.arguments ?? {};
  if (!isObject(params)) return rpcError(id, -32602, "Tool arguments must be a JSON object.");
  try {
    let value;
    switch (rpc.params?.name) {
      case "delete_food": value = await deleteFood(db,user,params); break;
      case "restore_food": value = await restoreFood(db,user,params); break;
      case "set_protein_target": value = await saveSettings(db, user, params); break;
      case "read_log": value = await readState(db, user, params); break;
      case "log_food": {
        if (params.id === undefined) fail("Provide a stable ID to prevent duplicates.");
        // Installed connector clients can have a cached schema without consumed_at.
        // Consume only the explicit, trailing transport line; never infer times.
        const marker = typeof params.description === "string"
          ? /\n\[consumed_at: ([^\r\n\]]+)\](?![\s\S])/.exec(params.description)
          : null;
        const food = marker ? {
          ...params,
          description: params.description.slice(0, marker.index),
          consumed_at: params.consumed_at === undefined ? marker[1] : params.consumed_at,
        } : params;
        value = await logFood(db, user, food); break;
      }
      case "log_weight": value = await logWeight(db, user, params); break;
      case "set_day_complete": value = await markComplete(db, user, params); break;
      default: return rpcError(id, -32602, "Unknown tool.");
    }
    return rpcResult(id, {content: [{type: "text", text: JSON.stringify(value)}], structuredContent: value});
  } catch (error) {
    return rpcResult(id, {isError: true, content: [{type: "text", text: error instanceof DataError ? error.message : "Could not access the log right now."}]});
  }
}

export async function handleData(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  if (path !== "/mcp" && !path.startsWith("/api/")) return null;

  const user = request.headers.get("oai-authenticated-user-id");
  try {
    if (path === "/mcp") {
      // Sites owns the gateway. Discovery is metadata only; every tool call needs
      // the verified gateway identity and a JSON request, with no CORS enabled.
      if (request.method !== "POST") return json({error: "Use POST."}, 405, {"Allow": "POST"});
      return await handleMcp(request, env?.DB, user);
    }
    if (!user) return json({error: "Sign in with your ChatGPT account to access your log."}, 401);
    if (!env?.DB) return json({error: "The log is temporarily unavailable."}, 503);
    if (request.method !== "GET") ensureBrowserOrigin(request);
    if ((path === "/api/state" || path === "/api/log") && request.method === "GET") {
      const state=await readState(env.DB, user, {from: url.searchParams.get("from") ?? undefined, to: url.searchParams.get("to") ?? undefined});
      if(path==="/api/state"){
        const [preference,display,foodLogTip]=await Promise.all([
          env.DB.prepare("SELECT conversation_url FROM food_chat_preferences WHERE user_id=?").bind(user).first(),
          env.DB.prepare("SELECT energy_unit FROM display_preferences WHERE user_id=?").bind(user).first(),
          env.DB.prepare("SELECT 1 AS seen FROM food_log_tip_seen WHERE user_id=?").bind(user).first(),
        ]);
        if(display)state.settings.energy_unit=display.energy_unit;
        if(foodLogTip)state.settings.food_log_tip_seen=true;
        if(preference){
          state.settings.food_chat_ready=true;
          if(preference.conversation_url)state.settings.food_chat_url=preference.conversation_url;
        }
      }
      return json(state);
    }
    if (path === "/api/food" && request.method === "DELETE") return json(await deleteFood(env.DB, user, await input(request)));
    if (request.method === "POST") {
      switch (path) {
        case "/api/delete-account":
          if(request.headers.get("origin")!==url.origin)fail("Only this dashboard may delete Plate data.",403);
          return json(await deletePlateAccount(env.DB,user,await input(request)));
        case "/api/food-chat": return json(await saveFoodChat(env.DB, user, await input(request)));
        case "/api/display-preferences": return json(await saveDisplayPreferences(env.DB, user, await input(request)));
        case "/api/food-log-tip": return json(await claimFoodLogTip(env.DB, user, await input(request)));
        case "/api/target-history":
          if(request.headers.get("origin")!==url.origin)fail("Only this dashboard may change target history.",403);
          return json(await saveNutritionTargetCorrection(env.DB,user,await input(request)));
        case "/api/preferences": return json(await savePreferences(env.DB, user, await input(request)));
        case "/api/settings": return json(await saveSettings(env.DB, user, await input(request)));
        case "/api/food": return json(await logFood(env.DB, user, await input(request)));
        case "/api/weight": return json(await logWeight(env.DB, user, await input(request)));
        case "/api/weights/import": return json(await importWeights(env.DB, user, await input(request)));
        case "/api/complete": return json(await markComplete(env.DB, user, await input(request)));
      }
    }
    return json({error: "Not found."}, 404);
  } catch (error) {
    return json({error: error instanceof DataError ? error.message : "Could not access the log right now."}, error instanceof DataError ? error.status : 500);
  }
}
