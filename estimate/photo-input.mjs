export async function preparePlatePhoto(file){
 if(!file||file.size===0||file.size>25_000_000||
   (file.type&&!/^image\/(?:jpeg|png|webp|avif|heic|heif)$/i.test(file.type))){
  throw Error('Choose a photo under 25 MB.');
 }
 const url=URL.createObjectURL(file);
 try{
  const image=new Image();
  image.src=url;
  await image.decode();
  if(!image.naturalWidth||!image.naturalHeight)throw Error('Empty photo');
  return await normalisePlatePixels(image,image.naturalWidth,image.naturalHeight);
 }catch{
  throw Error('Couldn’t open that photo. Try a JPEG or PNG.');
 }finally{URL.revokeObjectURL(url)}
}

export async function normalisePlatePixels(source,width,height){
 if(!width||!height)throw Error('The camera isn’t ready yet.');
  const scale=Math.min(1,768/Math.max(width,height));
  const canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(width*scale));
  canvas.height=Math.max(1,Math.round(height*scale));
  const context=canvas.getContext('2d',{alpha:false});
  if(!context)throw Error('No canvas');
  context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);
  context.drawImage(source,0,0,canvas.width,canvas.height);
  const result=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
  if(!result||result.type!=='image/png'||result.size>2_500_000)throw Error('Bad image');
  return result;
}
export function stopCameraTracks(stream){
 for(const track of stream?.getTracks()??[])track.stop();
}
export function prefersNativeCamera(navigator){
 if(typeof navigator.userAgentData?.mobile==='boolean')return navigator.userAgentData.mobile;
 return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent??'')||
  (/Mac/i.test(navigator.platform??'')&&navigator.maxTouchPoints>1);
}
