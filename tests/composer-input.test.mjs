import test from 'node:test';
import assert from 'node:assert/strict';
import {isComposerSubmit,parseWeighIn} from '../estimate/composer-input.mjs';

test('standalone weight works without a verb but is deliberately disjoint from food portions',()=>{
 for(const input of ['84.8 kg','84.8kg','84,8 kilos','I weigh 84.8 kilograms.','I just weighed in at 84.8 kg','my weight is 84.8 kg']){
  assert.deepEqual(parseWeighIn(input),{kg:84.8,valid:true},input);
 }
 for(const input of ['I ate 1 kg of watermelon','84.8 g','84.8','84.8 kg and I ate a pear','500g mince']){
  assert.equal(parseWeighIn(input),null,input);
 }
 assert.deepEqual(parseWeighIn('1 kg'),{kg:1,valid:false});
});
test('Enter sends while Shift+Enter and input-method composition retain their normal behaviour',()=>{
 assert.equal(isComposerSubmit({key:'Enter'}),true);
 for(const event of [{key:'Enter',shiftKey:true},{key:'Enter',isComposing:true},{key:'Enter',keyCode:229},{key:'Tab'}]){
  assert.equal(isComposerSubmit(event),false);
 }
});

test('desktop camera goes to the webcam; phones and tablets may use their native capture',async()=>{
 const {prefersNativeCamera,stopCameraTracks}=await import('../estimate/photo-input.mjs');
 assert.equal(prefersNativeCamera({userAgentData:{mobile:false},userAgent:'Windows'}),false);
 assert.equal(prefersNativeCamera({userAgentData:{mobile:true},userAgent:'Android'}),true);
 assert.equal(prefersNativeCamera({userAgent:'iPhone'}),true);
 assert.equal(prefersNativeCamera({platform:'MacIntel',maxTouchPoints:5}),true);
 let stopped=0;
 stopCameraTracks({getTracks:()=>[{stop(){stopped++}},{stop(){stopped++}}]});
 stopCameraTracks(null);assert.equal(stopped,2);
});
