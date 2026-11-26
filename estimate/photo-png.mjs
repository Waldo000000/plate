// Accept only bounded browser-canvas PNG, never forward original uploads or metadata.
const pngMagic=[137,80,78,71,13,10,26,10];
const pngCrcTable=Uint32Array.from({length:256},(_,i)=>{
 for(let j=0;j<8;j++)i=(i>>>1)^((i&1)?0xedb88320:0);
 return i>>>0;
});
const pngCrc=bytes=>{
 let c=0xffffffff;
 for(const b of bytes)c=(c>>>8)^pngCrcTable[(c^b)&255];
 return (c^0xffffffff)>>>0;
};
const pngInvalid=()=>new TypeError('Invalid photo');
export async function sanitizeCanvasPng(bytes,{mime,signal,maxPixels,maxOutputBytes}){
 if(mime!=='image/png'||bytes.length<57||bytes.length>maxOutputBytes||!pngMagic.every((b,i)=>bytes[i]===b))throw pngInvalid();
 const data=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 const take=(from,to)=>bytes.subarray(from,to);
 const kept=[take(0,8)],zipped=[];
 let width,height,channels,stride,ended=false,started=false,afterData=false;
 for(let pos=8,chunks=0;pos<bytes.length;){
  if(++chunks>300||pos+12>bytes.length)throw pngInvalid();
  signal.throwIfAborted();
  const length=data.getUint32(pos),end=pos+length+12;
  if(end>bytes.length)throw pngInvalid();
  const type=String.fromCharCode(...take(pos+4,pos+8));
  if(!/^[A-Za-z]{4}$/.test(type)||pngCrc(take(pos+4,end-4))!==data.getUint32(end-4))throw pngInvalid();
  if(type==='IHDR'){
   if(pos!==8||length!==13)throw pngInvalid();
   width=data.getUint32(pos+8);height=data.getUint32(pos+12);
   const [depth,colour,compression,filter,interlace]=take(pos+16,pos+21);
   if(!width||!height||width>768||height>768||width*height>maxPixels||depth!==8||
     ![2,6].includes(colour)||compression||filter||interlace)throw pngInvalid();
   channels=colour===2?3:4;stride=width*channels+1;kept.push(take(pos,end));
  }else if(!width)throw pngInvalid();
  else if(type==='IDAT'){
   if(afterData)throw pngInvalid();
   started=true;zipped.push(take(pos+8,end-4));kept.push(take(pos,end));
  }else if(type==='IEND'){
   if(length||!started||end!==bytes.length)throw pngInvalid();
   kept.push(take(pos,end));ended=true;
  }else{
   if(type[0]===type[0].toUpperCase())throw pngInvalid();
   if(started)afterData=true;
  }
  pos=end;
 }
 if(!ended)throw pngInvalid();
 const stream=new Blob(zipped).stream().pipeThrough(new DecompressionStream('deflate'));
 const reader=stream.getReader(),outLength=stride*height;
 const abort=()=>{void reader.cancel().catch(()=>{})};
 signal.addEventListener('abort',abort,{once:true});
 let offset=0;
 try{
  while(true){
   signal.throwIfAborted();
   const {done,value}=await reader.read();signal.throwIfAborted();
   if(done)break;
   if(offset+value.length>outLength)throw pngInvalid();
   for(let i=(stride-offset%stride)%stride;i<value.length;i+=stride)if(value[i]>4)throw pngInvalid();
   offset+=value.length;
  }
 }finally{signal.removeEventListener('abort',abort);abort();reader.releaseLock();}
 if(offset!==outLength)throw pngInvalid();
 const clean=new Uint8Array(kept.reduce((n,p)=>n+p.length,0));
 let index=0;
 for(const part of kept){clean.set(part,index);index+=part.length}
 return {bytes:clean,mime:'image/png',width,height};
}
