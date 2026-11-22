import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const html=readFileSync('index.html','utf8');
const script=html.slice(html.indexOf('const CHAT_IMPORT_LIMIT='),html.indexOf('function make(tag,'));
function setup(){
 const nodes={},calls=[];let id=0,reloads=0,failId=null,trayOpen=false;
 const n=(sel)=>nodes[sel]??={value:'',children:[],focus(){},close(){this.open=false},scrollIntoView(){this.scrolled=true},closest(){return false},reportValidity:()=>true,replaceChildren(){this.children=[]},append(...items){this.children.push(...items)}};
 n('#day').value='2026-11-22';n('#chatImportPreview').hidden=true;
 const location={hash:'',origin:'https://plate.example',pathname:'/',search:'?test=1'};
 const document={referrer:'',querySelectorAll:()=>[]};
 const history={state:null,replaceState(_state,_title,next){location.hash='';history.replaced=next}};
 const context={ready:true,busy:false,$:n,URL,location,document,history,state:{settings:{},food:[]},openLog(){n('#logSheet').open=true},crypto:{randomUUID:()=>String(++id)},KJ_PER_KCAL:4.184,
 GROUPS:[['dairy','Dairy']],NUT_INPUTS:{protein_g:'#protein',fibre_g:'#fibre'},
 dateFullFmt:{format:()=> '22 November 2026'},dateNum:()=>0,kgf:{format:String},showKj:n=>n+' kJ',
 make:(tag,text)=>({...n(tag+'-'+id+Math.random()),tag,textContent:text}),
 status(message,error,sel){n(sel).textContent=message;},btnState(){context.refreshButtons()},
 async api(path,data){calls.push([path,data]);if(data.id===failId){failId=null;throw Error('lost request');}if(path==='/api/food-chat')return {ok:true,food_chat_url:data.url};},
 async refresh(){reloads++},revealSavedFood(draft){trayOpen=true;n('#foodListCard').scrolled=true;n('#foodListCard').firstMeal=draft.firstMeal},consumedAtOnDay(day,time){return day+'T'+time+':00+10:00'}};
 runInNewContext(script+';globalThis.parse=parseChatImport;globalThis.refreshButtons=chatImportButtons;globalThis.handleLink=handleFoodImportLink;globalThis.prompt=foodChatPrompt;',context);
 return {context,n,calls,get reloads(){return reloads},get trayOpen(){return trayOpen},fail(key){failId=key}};
}
const coffee={description:'Coffee',kj:540,time:'14:00',macros:{protein_g:7,fibre_g:0},groups:{dairy:540}};
test('strict ChatGPT JSON accepts plain/fenced entries and refuses account, date, invalid numbers or unknown fields',()=>{
 const {context}=setup();
 assert.equal(context.parse(JSON.stringify([coffee]))[0].time,'14:00');
 assert.equal(context.parse('```json\n'+JSON.stringify([coffee])+'\n```')[0].macros.fibre_g,0);
 for(const row of [{...coffee,user_id:'other'},{...coffee,id:'other'},{...coffee,day:'2026-11-21'},{...coffee,kj:'540'},{...coffee,time:'14:00\n'},{...coffee,time:'24:00'},{...coffee,macros:{protein_g:-1}},{...coffee,groups:{dairy:550}},{...coffee,groups:{bad:10}}]){
  assert.throws(()=>context.parse(JSON.stringify([row])),/Entry 1/);
 }
 assert.throws(()=>context.parse('[]'));assert.throws(()=>context.parse(JSON.stringify(Array(21).fill(coffee))));
});
test('preview has no writes, confirm posts only typed food fields on selected date, retry reuses ID',async()=>{
 const s=setup();
 s.n('#chatImportPaste').value=JSON.stringify([coffee,{description:'Egg',kj:400}]);
 s.n('#chatImportReview').onclick();
 assert.equal(s.calls.length,0);assert.equal(s.n('#chatImportPreview').hidden,false);assert.equal(s.n('#chatImportDate').textContent,'Save to 22 November 2026');
 s.fail('2');await s.n('#chatImportSave').onclick();
 assert.equal(s.calls.length,2);assert.equal(s.n('#chatImportSave').textContent,'Retry 1 entry');
 await s.n('#chatImportSave').onclick();
 assert.equal(s.calls.length,3);assert.equal(s.calls[1][1].id,s.calls[2][1].id);assert.equal(s.reloads,1);
 assert.equal(s.calls[0][0],'/api/food');assert.equal(s.calls[0][1].day,'2026-11-22');
 assert.equal(s.calls[0][1].nutrition.macros.fibre_g,0);assert.equal(s.calls[0][1].consumed_at,'2026-11-22T14:00:00+10:00');
});
test('changing the date or JSON invalidates the confirmation',async()=>{
 const s=setup();s.n('#chatImportPaste').value=JSON.stringify([coffee]);s.n('#chatImportReview').onclick();
 s.n('#day').value='2026-11-21';await s.n('#chatImportSave').onclick();
 assert.equal(s.calls.length,0);assert.equal(s.n('#chatImportPreview').hidden,true);
 s.n('#chatImportReview').onclick();s.n('#chatImportPaste').oninput();await s.n('#chatImportSave').onclick();
 assert.equal(s.calls.length,0);assert.equal(s.n('#chatImportPreview').hidden,true);
});


test('shared starter is the first action; imported links wait for auth and preview before save',async()=>{
 assert.match(html,/<button [^>]*id="plateStarter"[^>]*>Log food in ChatGPT<\/button>/);
 assert.doesNotMatch(html,/id="returnedFoodChatUrl"|id="openFoodChat"/);
 const s=setup(),{context:c}=s;
 c.location.hash='#import='+encodeURIComponent(JSON.stringify([coffee]));
 c.ready=false;c.handleLink();assert.match(c.location.hash,/^#import=/);assert.equal(s.calls.length,0);
 c.ready=true;c.handleLink();
 assert.equal(c.location.hash,'');assert.equal(c.history.replaced,'/?test=1');
 assert.equal(s.n('#logSheet').open,true);assert.equal(s.n('#chatImportPreview').hidden,false);assert.equal(s.calls.length,0);
 await s.n('#chatImportSave').onclick();
 assert.deepEqual(s.calls.map(([path])=>path),['/api/food']);
 assert.equal(s.n('#logSheet').open,false);assert.equal(s.trayOpen,true);assert.equal(s.n('#foodListCard').scrolled,true);assert.equal(s.n('#foodListCard').firstMeal,true);
 c.location.hash='#import='+'a'.repeat(3601);c.handleLink();await s.n('#chatImportSave').onclick();
 assert.equal(s.calls.length,1);assert.match(s.n('#chatImportStatus').textContent,/too long/);
 assert.match(c.prompt('https://plate.example/'),/put the link on its own line. End the reply at that link/);
});

test('starter uses one aligned primary action with no duplicate hint',()=>{
 const starter=html.match(/<section data-chat-step="starter">([^]*?)<\/section>/)?.[1];
 assert.match(starter,/^<button[^>]*>Log food in ChatGPT<\/button>$/);
 assert.match(html,/\.chat-primary\{display:flex;width:100%;align-items:center;justify-content:center/);
});
