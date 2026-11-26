export function isComposerSubmit(event) {
 return event.key==='Enter'&&!event.shiftKey&&!event.isComposing&&event.keyCode!==229;
}
export function parseWeighIn(value){
 const text=String(value).trim();
 const match=text.match(/^(?:i\s+(?:weigh(?:ed)?(?:\s+in)?|(?:just\s+)?weighed\s+in)(?:\s+at)?\s+|(?:my\s+)?weight(?:\s+is)?\s*:?\s*)?(\d{1,3}(?:[.,]\d{1,3})?)\s*(?:kg|kilos?|kilograms?)[.!]?$/i);
 if(!match)return null;
 const kg=Number(match[1].replace(',','.'));
 return {kg,valid:kg>=20&&kg<=800};
}
