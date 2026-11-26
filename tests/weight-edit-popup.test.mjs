import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const html=readFileSync('index.html','utf8');
test('the transmitted click of a detached edit control still belongs to its original callout',()=>{
 const code=html.slice(html.indexOf('function isChartPopupClick('),html.indexOf("document.addEventListener('click',event=>{if(chartPopup&&!isChartPopupClick"));
 const detached={closest:()=>null},callout={matches:selector=>selector.includes('.record-callout')};
 const ctx={};runInNewContext(code+';globalThis.inside=isChartPopupClick',ctx);
 assert.equal(ctx.inside({target:detached,composedPath:()=>[detached,callout]}),true);
 assert.equal(ctx.inside({target:detached,composedPath:()=>[detached]}),false);
 assert.match(html,/make\('button',value\.text,'record-weight-edit'\)/);
 assert.doesNotMatch(html,/record-weight-edit[^\n]*<svg/);
});
