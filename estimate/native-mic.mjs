export async function findLocalRecognition(Recognition) {
  if (typeof Recognition !== 'function' || typeof Recognition.available !== 'function' ||
      !('processLocally' in Recognition.prototype)) return null;
  for (const lang of ['en-AU','en-US']) {
    try {
      if (await Recognition.available({langs:[lang],processLocally:true})!=='available') continue;
      const recognition=new Recognition();
      recognition.lang=lang;
      recognition.processLocally=true;
      if (recognition.processLocally!==true) return null;
      recognition.continuous=false;
      recognition.interimResults=false;
      return recognition;
    } catch {return null}
  }
  return null;
}

export function createBrowserRecognition(Recognition, allowOnline) {
  if (allowOnline !== true || typeof Recognition !== 'function') return null;
  try {
    const recognition=new Recognition();
    recognition.lang='en-AU';
    if ('processLocally' in recognition) {
      recognition.processLocally=false;
      if (recognition.processLocally!==false) return null;
    }
    recognition.continuous=false;
    recognition.interimResults=false;
    return recognition;
  } catch {return null}
}
