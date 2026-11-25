import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const html=readFileSync('index.html','utf8');
const source=html.slice(html.indexOf('let weightEstimateCache='),html.indexOf('function wireLinkedChart'))+html.slice(html.indexOf('function trendIntervals'),html.indexOf('function tickStep'))+html.slice(html.indexOf('function weightEstimate('),html.indexOf('function drawWeightChart'));
function setup(){
 let current='2026-11-20',draws=0,focusOptions=null;
 const weight={setAttribute(){}};const button={hidden:true,disabled:false},picker={value:'2026-11-19',focus:o=>{focusOptions=o}},plot={focus:o=>{focusOptions=o}},anchor={getBoundingClientRect:()=>({top:100})};
 const c={DAY:86400000,dateNum:d=>Date.parse(d+'T00:00:00Z'),state:{weights:[]},roundKg:n=>n+' kg',ready:true,busy:false,document:{activeElement:null},$:id=>({'#selectedWeight':weight,'#todayButton':button,'#day':picker,'#chart svg':plot,'#chart':anchor}[id]),today:()=>current,dayFlick:null,clearPeek(){},cancelEdit(){},status(){},updateManualDate(){},drawDay(){draws++;c.updateTodayButton()},window:{scrollBy(){throw Error('unexpected scroll')}}};
 runInNewContext(source+';globalThis.testAPI={setPopup:v=>chartPopup=v,getPopup:()=>chartPopup,linkedCharts,updateTodayButton,selectChartDay};',c);
 return {c,button,picker,plot,weight,get draws(){return draws},get focusOptions(){return focusOptions},setCurrent:d=>current=d};
}
test('Today is hidden only for current Brisbane day or uninitialised selection; busy state disables it',()=>{
 const s=setup();s.c.updateTodayButton();assert.equal(s.button.hidden,false);
 s.picker.value='2026-11-20';s.c.updateTodayButton();assert.equal(s.button.hidden,true);
 s.picker.value='';s.c.updateTodayButton();assert.equal(s.button.hidden,true);
 s.picker.value='2026-11-19';s.c.busy=true;s.c.updateTodayButton();assert.equal(s.button.disabled,true);assert.equal(s.button.hidden,false);
});
test('activation resets day, closes tooltip, synchronises both charts, and recovers focus without scrolling',()=>{
 const s=setup();let paints=0;s.c.testAPI.linkedCharts.set('weight',()=>paints++);s.c.testAPI.linkedCharts.set('nutrition',()=>paints++);
 s.c.testAPI.setPopup('nutrition');s.c.document.activeElement=s.button;s.button.onclick();
 assert.equal(s.picker.value,'2026-11-20');assert.equal(s.picker.max,'2026-11-20');assert.equal(s.c.testAPI.getPopup(),null);
 assert.equal(s.draws,1);assert.equal(paints,2);assert.equal(s.button.hidden,true);assert.equal(s.focusOptions.preventScroll,true);
});
test('both chart origins and daily re-render refresh visibility, including a new Brisbane date',()=>{
 const s=setup();for(const origin of ['weight','nutrition']){
  s.c.testAPI.selectChartDay('2026-11-18',origin);assert.equal(s.button.hidden,false);
  s.c.testAPI.selectChartDay('2026-11-20',origin);assert.equal(s.button.hidden,true);
 }
 s.setCurrent('2026-11-21');s.c.drawDay();assert.equal(s.button.hidden,false);
 s.picker.value='2026-11-21';s.c.drawDay();assert.equal(s.button.hidden,true);
 assert.match(html,/function drawDay\(\)\{\s*updateTodayButton\(\)/);
 assert.match(html,/function redrawSelectedDay\(\)\{[^}]*drawDay\(\)/);
 assert.match(html,/draws\(\);drawDay\(\);/);
});
test('native Today action sits by the date and never changes chart ranges',()=>{
 assert.match(html,/<header class="mast">[\s\S]*id="todayButton"[\s\S]*id="day"[\s\S]*id="openSettings"/);

 assert.match(html,/\.progress-head>\.range\{justify-self:end/);
 assert.doesNotMatch(source,/weightRange\s*=|energyRange\s*=|scrollIntoView/);
});

test('weight chart shows an exact reading, a labelled nearby estimate, or blank when no nearby data',()=>{
 const s=setup();s.c.state.weights=[{day:'2026-11-19',kg:86.4}];s.c.updateTodayButton();assert.equal(s.weight.textContent,'Selected day weight: 86.4 kg');
 s.picker.value='2026-11-18';s.c.updateTodayButton();assert.equal(s.weight.textContent,'Estimated selected day weight: 86.4 kg');
 s.picker.value='2026-10-01';s.c.updateTodayButton();assert.equal(s.weight.textContent,'No reliable estimate for the selected day');
 assert.match(html,/<span id="selectedWeight" class="track-tile-sr"/);
});
