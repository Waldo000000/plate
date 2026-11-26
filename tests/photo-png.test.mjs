import test from 'node:test';
import assert from 'node:assert/strict';
import {deflateSync,crc32} from 'node:zlib';
import {sanitizeCanvasPng} from '../estimate/photo-png.mjs';
import {createMealEstimateRoute} from '../estimate/meal-estimate-route.mjs';

const signature=Buffer.from([137,80,78,71,13,10,26,10]);
function chunk(type,body){
 const payload=Buffer.concat([Buffer.from(type),body]),n=Buffer.alloc(4),crc=Buffer.alloc(4);
 n.writeUInt32BE(body.length);crc.writeUInt32BE(crc32(payload));
 return Buffer.concat([n,payload,crc]);
}
function png({width=1,height=1,scanline=Buffer.from([0,100,120,125]),metadata=true}={}){
 const h=Buffer.alloc(13);h.writeUInt32BE(width,0);h.writeUInt32BE(height,4);h[8]=8;h[9]=2;
 return Buffer.concat([signature,chunk('IHDR',h),...(metadata?[chunk('tEXt',Buffer.from('Comment\0Private fixture metadata'))]:[]),
  chunk('IDAT',deflateSync(scanline)),chunk('IEND',Buffer.alloc(0))]);
}
test('only bounded real PNG pixels reach OpenAI; metadata and invalid data do not',async()=>{
 const options={mime:'image/png',signal:new AbortController().signal,maxPixels:768*768,maxOutputBytes:2_500_000};
 const result=await sanitizeCanvasPng(png(),options);
 assert.equal(result.width,1);assert.equal(result.height,1);
 assert.deepEqual(Buffer.from(result.bytes),png({metadata:false}));
 await assert.rejects(sanitizeCanvasPng(png({width:769}),options));
 await assert.rejects(sanitizeCanvasPng(png({scanline:Buffer.alloc(200)}),options));
 await assert.rejects(sanitizeCanvasPng(png({scanline:Buffer.from([7,100,120,125])}),options));
 await assert.rejects(sanitizeCanvasPng(Buffer.concat([png(),Buffer.from('suffix')]),options));
});
test('the authenticated photo estimator calls the vision path with the stripped PNG',async()=>{
 const origin='https://plate.example.test';
 const route=createMealEstimateRoute({trustedAccount:()=> 'person',claim:()=>true,sanitizePhoto:sanitizeCanvasPng,
  fetchImpl:async(url,request)=>{
   const data=JSON.parse(request.body);
   const img=data.input[0].content[0];
   assert.equal(url,'https://api.openai.com/v1/responses');assert.equal(data.store,false);
   assert.equal(img.type,'input_image');
   assert.deepEqual(Buffer.from(img.image_url.split(',')[1],'base64'),png({metadata:false}));
   return Response.json({status:'completed',output:[{type:'message',role:'assistant',content:[{type:'output_text',text:JSON.stringify({entries:[{description:'Apple',kj:330,macros:{},groups:{fruit:330}}]})}]}]});
  }});
 const response=await route(new Request(origin+'/api/estimate-meal',{method:'POST',headers:{origin,'content-type':'image/png'},body:png()}),
  {ESTIMATE_LIMIT_DB:{},OPENAI_API_KEY:'fixture-only',PLATE_ESTIMATE_ENABLED:'true',PLATE_ESTIMATE_DAILY_LIMIT:'1',PLATE_ESTIMATE_TRIAL_ACCOUNT:'person'});
 assert.equal(response.status,200);assert.equal((await response.json()).rows[0].description,'Apple');
});
