import {readFileSync} from 'node:fs';import {runInNewContext} from 'node:vm';import {test} from 'node:test';import assert from 'node:assert/strict';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const c={DAY:86400000,kgf:new Intl.NumberFormat('en-AU',{maximumFractionDigits:1})};
runInNewContext(html.slice(html.indexOf('function proteinSummary'),html.indexOf('function drawProteinChart'))+html.slice(html.indexOf('function trendIntervals'),html.indexOf('function tickStep'))+';globalThis.api={proteinSummary,proteinLabel,trendIntervals,trendGaps}',c);
const {proteinSummary,proteinLabel,trendIntervals,trendGaps}=c.api;
test('protein missing is not zero; known zero counts; summary tracks missing metadata without a repeated badge',()=>{
 assert.equal(proteinLabel(proteinSummary([{}])),'Protein not recorded');
 assert.equal(proteinLabel(proteinSummary([{nutrition:{macros:{protein_g:0}}}])),'0 g protein');
 assert.equal(proteinLabel(proteinSummary([{nutrition:{macros:{protein_g:6.8}}},{}])),'6.8 g protein');
 assert.equal(proteinSummary([{nutrition:{macros:{protein_g:6.8}}},{}]).missing,1);
});
test('dashed gaps connect only bounded intervals, leaving averages unchanged',()=>{
 const D=c.DAY,trend=trendIntervals([[0,90],[D,89],[1000*D,86],[1001*D,85]],0,1100*D);
 const before=JSON.stringify(trend),gaps=trendGaps(trend);
 assert.equal(gaps.length,1);assert.equal(gaps[0][0],6*D);assert.equal(gaps[0][2],1001*D);
 assert.equal(JSON.stringify(trend),before);assert.equal(gaps[0][1],89.5);assert.equal(gaps[0][3],85.5);
 assert.equal(trendGaps([]).length,0);assert.equal(trendGaps([[0,D,88],[2*D,3*D,87]]).length,0);
});
