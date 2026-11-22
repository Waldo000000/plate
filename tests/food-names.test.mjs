import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {test} from 'node:test';
import assert from 'node:assert/strict';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const snippet=html.slice(html.indexOf('function foodDisplayName('),html.indexOf('function dayFoods('));
const name=runInNewContext(snippet+'\nfoodDisplayName');

test('cherry summaries preserve singular or plural without portion notes',()=>{
 for(const [description,expected] of [
  ['One fresh cherry (estimated 8 g, excluding pit)','Cherry'],
  ['2 fresh cherries (16 g)','Cherries'],
  ['Two cherries','Cherries'],
  ['cherries','Cherries'],
  ['Cherry yoghurt','Cherry yoghurt']
 ])assert.equal(name(description),expected);
});
test('food rows use concise names and keep recipe or portion detail available',()=>{
 for(const [description,expected] of [
  ['Two fried eggs with half the usual butter and olive oil (estimated ½ tsp each)','Fried eggs'],
  ['Two fried eggs, estimated 1 tsp butter and 1 tsp olive oil consumed','Fried eggs'],
  ['One fried egg','Fried egg'],
  ['Flat white, estimated 200 mL full-cream milk, no sugar','Flat white'],
  ['Mista Boo salmon and scallop aburi, 1 extra piece (estimated)','Salmon & scallop aburi'],
  ['Salt & pepper roasted pumpkin seeds, shells eaten (estimated 23.5 g whole seeds)','Pumpkin seeds']
 ])assert.equal(name(description),expected);
 assert.ok(name('Wholegrain bread (2 slices) with one large banana, peanut butter (~30 g) and honey (~8 g), estimated from photo').length<=34);
 assert.equal(name('Tahini'), 'Tahini');
 assert.ok(html.includes('details.append(summary,foodEntryDetails(f,interactive))'));
 assert.ok(html.includes("body.append(make('p',food.description),macros)"));
});


test('a named food before a bullet keeps the full note out of its display title',()=>{
 for(const [description,expected] of [
  ['Bacon • About 45 g cooked, roughly two small rashers as pictured.','Bacon'],
  ['Fried eggs • About two large eggs with an estimated teaspoon of cooking fat absorbed.','Fried eggs'],
  ['Avocado • About 60 g of sliced avocado, estimated from the photo.','Avocado'],
  ['Flat white·Made with full-cream milk.','Flat white'],
  ['Peach•Fresh, medium.','Peach']
 ]) assert.equal(name(description),expected);
 const code=html.slice(html.indexOf('function foodIcon('),html.indexOf('const consumedClockFormat='));
 const context={};runInNewContext(code+';globalThis.icon=foodIcon;',context);
 assert.equal(context.icon({description:'Bacon • Served next to eggs'}),'🥓');
 assert.equal(context.icon({description:'Avocado • Served next to eggs'}),'🥑');
});

test('strawberry and blueberry icons distinguish singular, plural and portion notes',()=>{
 const code=html.slice(html.indexOf('function foodIcon('),html.indexOf('const consumedClockFormat='));
 const icon=runInNewContext(code+';foodIcon');
 for(const [description,expected] of [
  ['Strawberry','🍓'],['Strawberries • About 3 medium strawberries (45 g)','🍓'],
  ['Blueberry','🫐'],['Blueberries • Estimated small handful (40 g)','🫐'],
  ['Mixed berries','🫐'],['Blueberries • Served with a strawberry','🫐']
 ])assert.equal(icon({description,nutrition:{groups:{fruit:60}}}),expected);
});

test('food-name matches take priority over the category fallback',()=>{
 const code=html.slice(html.indexOf('function foodIcon('),html.indexOf('const consumedClockFormat='));
 const icon=runInNewContext(code+';foodIcon');
 for(const [description,expected] of [
  ['Jacket potato • A quarter, with bacon topping','🥔'],['Baked potatoes','🥔'],
  ['Potato chips','🍟'],['Broccoli','🥦'],['Cherry','🍒'],['Tomatoes','🍅'],
  ['Stone & Wood • One schooner','🍺'],['Kohlrabi','🥦']
 ])assert.equal(icon({description,nutrition:{groups:{vegetables:100}}}),expected,description);
 assert.equal(icon({description:'Spring rolls',nutrition:{groups:{discretionary:100}}}),'🍬');
 assert.equal(icon({description:'Unknown dish'}),'🍽️');
});

test('expanded name rules support Australian aliases, boundaries and dish precedence',()=>{
 const source=html.slice(html.indexOf('function foodIcon('),html.indexOf('const consumedClockFormat='));
 const icon=runInNewContext(source+';foodIcon');
 assert.ok(source.split(",'").length>=85);
 for(const [description,expected] of [
  ['Beef fried rice','🍚'],['Salmon aburi don','🍣'],['Chicken Caesar salad','🥗'],
  ['Rib fillet with chips','🥩'],['Apple juice','🥤'],['Pineapple chunks','🍍'],
  ['Cherry tomatoes','🍅'],['Baked spuds','🥔'],['Capsicum','🫑'],['Rockmelon','🍈'],
  ['Oat porridge','🥣'],['Chocolate chip biscuit','🍪'],['Blueberry muffin','🧁'],
  ['Lean biltong','🥩'],['Barramundi fillet','🐟'],['Long black','☕']
 ])assert.equal(icon({description}),expected,description);
});
