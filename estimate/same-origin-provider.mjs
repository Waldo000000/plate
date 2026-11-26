// Browser-only transport for a future private trial. Not loaded by the existing fixture pages.
export function makeSameOriginEstimateProvider(fetchImpl=globalThis.fetch) {
  return {
    source:'estimate',
    async estimate(input,{signal}={}) {
      const photo=input.kind==='photo';
      const response=await fetchImpl('/api/estimate-meal',{
        method:'POST',mode:'same-origin',credentials:'same-origin',cache:'no-store',
        redirect:'error',signal,
        headers:{'Content-Type':photo?input.photo.type:'application/json'},
        body:photo?input.photo:JSON.stringify({kind:input.kind,text:input.text}),
      });
      if(!response.ok){
        if(response.status===502){
          // The server emits only allowlisted, user-safe diagnosis messages.
          const payload=await response.json().catch(()=>null);
          if(typeof payload?.error==='string')throw new Error(payload.error);
        }
        const message=({
          400:'Check the meal description or choose another photo.',
          401:'Sign in to Plate before requesting an estimate.',
          413:'That meal or photo is too large.',
          429:'Daily estimate limit reached. Manual entry is in Settings.',
          504:'The estimate took too long. Try again or enter food manually.',
        })[response.status]??'Couldn’t estimate this meal. You can enter food manually.';
        throw new Error(message);
      }
      const data=await response.json();
      if(data.source==='estimate'&&data.status==='unavailable')return null;
      if(data.source!=='estimate'||data.status!=='review'||!Array.isArray(data.rows))throw new TypeError('Couldn’t read the meal estimate.');
      return data.rows; // estimateMeal validates the rows again before the UI can enter review.
    }
  };
}
