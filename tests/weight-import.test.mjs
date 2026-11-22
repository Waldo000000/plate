import assert from "node:assert/strict";
import "../weight-import.js";
const run = (raw, options = {}) => globalThis.parseWeightData(raw, {today: "2026-11-18", ...options});
const values = (r) => r.entries.map(({day,kg}) => [day, kg]);

let r = run("\uFEFFWeight (kg),Date (YYYY-MM-DD)\r\n83.45,2026-11-18\r\n84.2,2026-11-17\r\n");
assert.deepEqual(values(r), [["2026-11-17",84.2],["2026-11-18",83.45]]);
assert.deepEqual([r.hasHeader,r.dateColumn,r.weightColumn,r.detectedUnit,r.detectedDateOrder],[true,1,0,"kg","ymd"]);
assert.deepEqual(r.headers, ["Weight (kg)","Date (YYYY-MM-DD)"]);

r = run("wEiGhT (KG)\tDaTe (yyyy-mm-dd)\n83.45\t2026-11-18\n84.2\t2026-11-17");
assert.equal(r.delimiter, "\t");
assert.deepEqual(values(r), [["2026-11-17",84.2],["2026-11-18",83.45]]);

r = run("date;Weight (kg);Note\n18/11/2026;83,5;\"At home; AM\"\n2/11/2026;84,5;\n29/02/2025;85;\n19/11/2026;85;");
assert.equal(r.delimiter, ";");
assert.equal(r.detectedDateOrder, "dmy");
assert.deepEqual(values(r), [["2026-11-02",84.5],["2026-11-18",83.5]]);
assert.deepEqual(r.invalid.map(x=>x.line), [4,5]);

r = run("11/7/2026,175 lb\n11/8/2026,174.5 lbs");
assert.equal(r.hasHeader, false);
assert.equal(r.dateAmbiguous, true);
assert.equal(r.entries.length, 0);
assert.equal(r.invalidCount, 2);
assert.deepEqual(values(run("11/7/2026,175 lb\n11/8/2026,174.5 lbs",{dateOrder:"mdy"})), [["2026-11-07",79.379],["2026-11-08",79.152]]);
assert.deepEqual(values(run("11/7/2026,175 lb",{dateOrder:"dmy"})), [["2026-07-11",79.379]]);
assert.deepEqual(values(run("4/4/2026,87")), [["2026-04-04",87]]);
assert.equal(run("11/7/2026,87",{dateOrder:"ymd"}).invalidCount, 1);

r = run("Date,Weight,Unit\n2026-11-18,175,pounds\n2026-11-16,83.2,kilograms\n2026-11-15,81.5,");
assert.equal(r.detectedUnit, "mixed");
assert.equal(r.unitAmbiguous, true);
assert.deepEqual(values(r), [["2026-11-16",83.2],["2026-11-18",79.379]]);
assert.deepEqual(values(run("Date,Weight,Unit\n2026-11-18,175,pounds\n2026-11-16,83.2,kilograms\n2026-11-15,81.5,",{unit:"kg"})), [["2026-11-15",81.5],["2026-11-16",83.2],["2026-11-18",79.379]]);
assert.equal(run("Date,Weight,Unit\n2026-11-18,175 lb,kg").invalidCount, 1);

r = run("Date,Weight (lb)\n2026-11-18T07:42:11.215+10:00,175.4\n2026-11-18 17:42:00 +1000,174.75\n2026-11-12T07:42Z,174.5");
assert.equal(r.detectedUnit, "lb");
assert.equal(r.duplicateCount, 1);
assert.deepEqual(values(r), [["2026-11-12",79.152],["2026-11-18",79.265]]);

r = run("14/11/2026 88 kg\n15/11/2026 87.4");
assert.equal(r.delimiter, "whitespace");
assert.deepEqual(values(r), [["2026-11-14",88],["2026-11-15",87.4]]);
assert.match(run("14/11/2026 88\n15/11/2026 87.4").notices.join(" "),/assumed to be kilograms/);

r = run("measured_at,goal weight,body weight (kg),notes\n2026-11-15,85,87.25,\"Row one\ncontinued\"\n2026-11-16,85,nope,\"oops\"\n2026-11-18,85,86.5,\"Commas, too\"");
assert.equal(r.weightColumn,2);
assert.deepEqual(values(r), [["2026-11-15",87.25],["2026-11-18",86.5]]);
assert.deepEqual(r.invalid.map(x=>x.line),[4]);
assert.deepEqual(values(run("Field 1,Field 2,Field 3\n85,87,2026-11-15",{hasHeader:true,dateColumn:2,weightColumn:1})),[["2026-11-15",87]]);

r = run("11/15/2026,82\n14/11/2026,84\n5/10/2026,85\n2026/10/03,87");
assert.equal(r.detectedDateOrder, "mixed");
assert.equal(r.dateAmbiguous,true);
assert.deepEqual(values(r),[["2026-10-03",87],["2026-11-14",84],["2026-11-15",82]]);
assert.deepEqual(values(run("Date;Weight\n3 Nov 2026;85\n\"Nov 4, 2026\";84.9")),[["2026-11-03",85],["2026-11-04",84.9]]);
assert.equal(run("2026-11-18 82",{dateColumn:0,weightColumn:0}).entries.length,0);
assert.equal(run("Date,Weight\n2099-01-01,85\n2026-04-31,87").invalidCount,2);
assert.equal(run("Date,Weight\n2026-11-18,\"85").invalidCount,1);
assert.equal(run("bad").entries.length,0);
r = run('"date","type","description","kj","kg","day_complete"\n"2026-11-18","food","Lunch","950","","true"\n"2026-11-18","weight","","","88.1","true"\n"2026-11-18","day","","","","true"');
assert.deepEqual(values(r), [["2026-11-18",88.1]]);
assert.equal(r.invalidCount,0);
assert.equal(run("11/7/2026,garbage").dateAmbiguous,false);
assert.match(run("Date,Weight,Unit\n2026-11-18,175,g").invalid[0].reason,/kilograms or pounds/);
const literalDates = 'Weight (kg),Date\r\n88.2,= "2026-11-18"\r\n89.3,"=""2026-11-17"""\r\n90.4,=DATE(2026/11/16)\r\n91.5,="2026-02-30"';
r = run(literalDates);
assert.deepEqual(values(r), [["2026-11-17",89.3],["2026-11-18",88.2]]);
assert.equal(r.invalidCount,2);
const manyRows = Array.from({length:263}, (_, i) => {
  const d = new Date(Date.UTC(2026,10,18-i)).toISOString().slice(0,10);
  return '89.6,"=""'+d+'"""';
});
r = run("Weight (kg),Date\r\n"+manyRows.join("\r\n"));
assert.equal(r.entries.length,263);
assert.equal(r.invalidCount,0);
console.log("Weight import parser checks passed (synthetic data).");
