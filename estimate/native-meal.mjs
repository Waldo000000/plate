import { estimateMeal } from './meal-estimate.mjs';
import { createBrowserRecognition } from './native-mic.mjs';
import { preparePlatePhoto, normalisePlatePixels, stopCameraTracks, prefersNativeCamera } from './photo-input.mjs';
import { isComposerSubmit, parseWeighIn } from './composer-input.mjs';
if (document.body.hasAttribute('data-native-composer') && $('#nativeMeal')) wireNativeMeal();

function wireNativeMeal() {
  const form=$('#nativeMeal'), sheet=$('#logSheet'), menu=$('#logActionMenu'), plus=$('#openLog');
  const marker=document.createComment('In-app composer');
  form.before(marker);
  function dock(){marker.after(form)}
  const text=$('#nativeText'),file=$('#nativePhoto'),photo=$('#nativePhotoPreview'),attachment=$('#nativeAttachment');
  const mic=$('#nativeMic'),review=$('#nativeReview'),message=$('#nativeMealStatus');
  const camera=$('#nativeCamera'),photoButton=$('#nativeAddPhoto'),photoChoices=$('#nativePhotoChoices');
  const webcam=$('#nativeWebcam'),video=$('#nativeWebcamVideo'),capture=$('#nativeWebcamTake');
  let webcamStream=null,webcamJob=0;
  const provider=makeSameOriginEstimateProvider();
  const available=document.body.hasAttribute('data-native-estimate');
  const settings=$('#appSettings'),logDate=$('#nativeLogDate');
  const composerDateFormat=new Intl.DateTimeFormat('en-AU',{weekday:'short',day:'numeric',month:'short',timeZone:'UTC'});
  function showComposerDate(){
    const day=$('#day').value,stamp=dateNum(day),historical=!!day&&day!==today()&&Number.isFinite(stamp);
    logDate.hidden=!historical;
    logDate.textContent=historical?'Logging to '+composerDateFormat.format(stamp).replace(',',''):'';
  }
  form.hidden=false;photoButton.hidden=!available;
  const note=make('p','Review imported entries.');
  note.id='nativeReviewNote';note.hidden=true;
  $('#chatImportDate').before(note);

  $('#guidedFood').setAttribute('aria-label','Log food in Plate');

  let selected=null,previewUrl=null,photoJob=0,preparing=false,run=null,micRun=null,dictated=false,writing=false,retryDraft=null,highlightTimer;
  function say(value='',error=false){
    message.textContent=value;
    message.classList.toggle('err',error);
  }
  function buttonState(){
    review.disabled=!webcam.hidden||preparing||!!run||writing||(!retryDraft&&(!selected&&!text.value.trim()));
    const restricted=writing||!!retryDraft;
    text.disabled=file.disabled=camera.disabled=photoButton.disabled=$('#nativeRemovePhoto').disabled=mic.disabled=restricted;
    if(restricted)setPhotoChoices(false);
    form.toggleAttribute('data-working',!!run||writing);
    const label=retryDraft?'Retry saving meal':!selected&&parseWeighIn(text.value)?'Save weight':'Log meal';
    review.setAttribute('aria-label',label);review.title=label;
  }
  function stopEstimate(){run?.abort();run=null;buttonState()}
  function micState(active){
    mic.setAttribute('aria-pressed',String(active));
    mic.setAttribute('aria-label',active?'Stop dictation':'Dictate meal');
    mic.title=active?'Stop dictation':'Dictate meal';
    $('#nativeMicStatus').textContent=active?'Listening':'';
  }
  function resetMic(){
    const active=micRun;
    micRun=null;micState(false);
    if(active?.recognition)try{active.recognition.abort()}catch{}
  }
  function updatePhoto(value){
    if(previewUrl)URL.revokeObjectURL(previewUrl);
    selected=value;
    previewUrl=selected?URL.createObjectURL(selected):null;
    if(previewUrl)photo.src=previewUrl;else photo.removeAttribute('src');
    attachment.hidden=photo.hidden=!selected;
    stopEstimate();say();
  }
  function setPhotoChoices(open){
    photoChoices.hidden=!open;photoButton.hidden=open||!available;photoButton.setAttribute('aria-expanded',String(open));
  }
  function stopWebcam(){
    webcamJob++;
    stopCameraTracks(webcamStream);webcamStream=null;
    video.srcObject=null;capture.disabled=true;webcam.hidden=true;
    buttonState();
  }
  async function openWebcam(){
    if(typeof navigator.mediaDevices?.getUserMedia!=='function'){
      say('Webcam access isn’t available here. Use the gallery icon instead.',true);return;
    }
    stopWebcam();stopEstimate();
    const job=++webcamJob;
    capture.disabled=true;webcam.hidden=false;buttonState();say('Opening camera…');
    $('#nativeWebcamClose').focus({preventScroll:true});
    let stream;
    try{
      stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720}}});
      if(job!==webcamJob){stopCameraTracks(stream);return}
      webcamStream=stream;
      video.srcObject=stream;await video.play();
      if(job!==webcamJob)return;
      capture.disabled=video.readyState<2; say();
      if(!capture.disabled)capture.focus({preventScroll:true});
    }catch(error){
      if(job!==webcamJob){stopCameraTracks(stream);return}
      stopWebcam();
      say(error.name==='NotAllowedError'?'Camera access was blocked. Check your browser’s camera permission, or choose a photo.':
       'Couldn’t open a webcam. Try the gallery icon instead.',true);
      photoButton.focus({preventScroll:true});
    }
  }
  function closeMenu(){
    stopWebcam();setPhotoChoices(false);setLogMenu(false);
    dock();
  }
  const sync=()=>{
    showComposerDate();
    const reviewing=!$('#chatImportPreview').hidden;
    form.hidden=reviewing||sheet.hasAttribute('data-legacy-food');
    note.hidden=!reviewing;
    if($('#guidedFood').hidden&&!menu.contains(form)){stopWebcam();stopEstimate();resetMic()}
  };
  function openNative(firstMeal=false,focus=true) {
    closeMenu();
    openLog(null,firstMeal);
    if(focus)text.focus({preventScroll:true});
  }

  const title=$('#logTitleText');
  new MutationObserver(()=>{
    if(title.textContent==='Log')title.textContent='Log food';
  }).observe(title,{childList:true});
  if(title.textContent==='Log')title.textContent='Log food';
  plus.onclick=()=>{
    if(!ready||busy)return;
    if(!menu.hidden){closeMenu();resetMic();stopEstimate();plus.focus();return}
    showComposerDate();menu.prepend(form);
    menu.hidden=false;
    plus.setAttribute('aria-expanded','true');
    text.focus({preventScroll:true});
  };
  new MutationObserver(()=>{
    if(menu.hidden&&menu.contains(form)){
      stopWebcam();setPhotoChoices(false);stopEstimate();resetMic();if(!writing&&!retryDraft)say();dock();
    }
  }).observe(menu,{attributes:true,attributeFilter:['hidden']});
  $('#legacyFoodSettings').hidden=!!document.documentElement.dataset.plateOnboarding;
  $('#settingsManualFood').onclick=()=>{
    if(!ready||busy)return;
    stopEstimate();resetMic();closeMenu();settings.close();
    openLog('manualFood',false,true);
    if(text.value.trim()&&!$('#description').value)$('#description').value=text.value.trim();
    $('#description').focus();
  };
  $('#settingsManualWeight').onclick=()=>{
    if(!ready||busy)return;
    stopEstimate();resetMic();closeMenu();settings.close();
    openLog('manualWeight',false,true);$('#kg').focus();
  };
  $('#settingsChatFood').onclick=()=>{
    if(!ready||busy)return;
    stopEstimate();resetMic();closeMenu();settings.close();
    openLog();sheet.setAttribute('data-legacy-food','');sync();
    showDirectFoodRecovery('copy');$('#chatImportCopy').focus();
  };
  $('#logModeFood').onclick=()=>{showManual(null);text.focus()};
  $('#backToGuidedFood').onclick=()=>{showManual(null);text.focus()};
  new MutationObserver(sync).observe($('#chatImportPreview'),{attributes:true,attributeFilter:['hidden']});
  new MutationObserver(sync).observe($('#guidedFood'),{attributes:true,attributeFilter:['hidden']});
  new MutationObserver(sync).observe(sheet,{attributes:true,attributeFilter:['data-legacy-food','data-native-quick','open']});
  sheet.addEventListener('cancel',event=>{if(writing)event.preventDefault()});
  sheet.addEventListener('close',()=>{
    if(sheet.open||writing)return;
    stopWebcam();stopEstimate();resetMic();
    photoJob++;preparing=false;text.value='';file.value='';camera.value='';dictated=false;
    updatePhoto(null);if(retryDraft)say('A save was interrupted. Retry to finish without adding duplicates.',true);sync();
  });
  $('#day').addEventListener('change',showComposerDate);
  text.onfocus=()=>setPhotoChoices(false);
  text.oninput=()=>{stopEstimate();say()};
  text.onkeydown=event=>{
    if(isComposerSubmit(event)){
      event.preventDefault();if(!review.disabled)review.click();
    }
  };
  photoButton.onclick=()=>{setPhotoChoices(true);$('#nativeTakePhoto').focus({preventScroll:true})};
  form.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&!webcam.hidden){
      event.preventDefault();event.stopPropagation();stopWebcam();say();photoButton.focus({preventScroll:true});return;
    }
    if(event.key==='Escape'&&!photoChoices.hidden){
      event.preventDefault();event.stopPropagation();setPhotoChoices(false);photoButton.focus({preventScroll:true});
    }
  });
  $('#nativeTakePhoto').onclick=()=>{
    setPhotoChoices(false);
    if(prefersNativeCamera(navigator)){camera.click();photoButton.focus({preventScroll:true})}
    else void openWebcam();
  };
  video.addEventListener('loadeddata',()=>{if(webcamStream&&!webcam.hidden)capture.disabled=false});
  $('#nativeWebcamClose').onclick=()=>{stopWebcam();say();photoButton.focus({preventScroll:true})};
  capture.onclick=async()=>{
    if(!webcamStream||capture.disabled)return;
    const job=webcamJob;
    capture.disabled=true;
    try{
      const blob=await normalisePlatePixels(video,video.videoWidth,video.videoHeight);
      if(job!==webcamJob)return;
      stopWebcam();updatePhoto(blob);review.focus({preventScroll:true});
    }catch{
      if(job===webcamJob){say('Couldn’t capture that photo. Try again.',true);capture.disabled=false}
    }
  };
  window.addEventListener('pagehide',stopWebcam);
  $('#nativeChoosePhoto').onclick=()=>{stopWebcam();setPhotoChoices(false);file.click();photoButton.focus({preventScroll:true})};
  file.onchange=camera.onchange=async event=>{
    const selectedFile=event.target.files[0];
    event.target.value='';
    if(!selectedFile)return;
    const job=++photoJob;
    preparing=true;stopEstimate();say('Preparing photo…');
    try{ const readyPhoto=await preparePlatePhoto(selectedFile);if(job===photoJob)updatePhoto(readyPhoto) }
    catch(error){if(job===photoJob)say(error.message,true)}
    finally{if(job===photoJob){preparing=false;buttonState()}}
  };
  $('#nativeRemovePhoto').onclick=()=>{photoJob++;preparing=false;updatePhoto(null);photoButton.focus()};
  const micFallback='Browser dictation isn’t available here. You can still type.';
  const recognitionType=()=>window.SpeechRecognition??window.webkitSpeechRecognition;
  mic.onclick=()=>{
    if(micRun){
      if(micRun.recognition&&mic.getAttribute('aria-pressed')==='true'){
        try{micRun.recognition.stop()}catch{resetMic()}
      }else{resetMic();say()}
      return;
    }
    const recognition=createBrowserRecognition(recognitionType(),true);
    if(!recognition){say(micFallback,true);return}
    const current={recognition};micRun=current;
    say();
    startRecognition(current,recognition);
  };
  function startRecognition(current,recognition){
    current.recognition=recognition;
    recognition.onstart=()=>{
      if(micRun!==current)return;
      micState(true);say();
    };
    recognition.onresult=event=>{
      if(micRun!==current)return;
      const transcript=Array.from(event.results).filter(result=>result.isFinal).map(result=>result[0].transcript).join(' ').trim();
      if(transcript){
        text.value=(text.value.trimEnd()+(text.value.trim()?' ':'')+transcript).slice(0,1200);
        dictated=true;stopEstimate();say();
      }
    };
    recognition.onerror=event=>{
      if(micRun!==current)return;
      resetMic();
      if(event.error==='not-allowed'||event.error==='service-not-allowed')say('Microphone access was blocked. Check this site’s microphone permission, or type.',true);
      else say(event.error==='no-speech'?'No words picked up. Try again or type.':micFallback);
    };
    recognition.onend=()=>{
      if(micRun!==current)return;
      resetMic();say();
    };
    try{recognition.start()}catch{resetMic();say(micFallback)}
  };

  function showLoggedMeal(draft){
    if($('#day').value!==draft.day){
      status('Meal logged to '+dateFullFmt.format(dateNum(draft.day))+'.');
      return;
    }
    revealSavedFood(draft);
    const rows=[...$('#foodList').children].filter(row=>draft.entryIds.includes(row.dataset.foodId));
    const first=rows.find(row=>row.dataset.foodId===draft.firstId);
    if(!first)return;
    clearTimeout(highlightTimer);
    for(const old of document.querySelectorAll('[data-just-logged]'))delete old.dataset.justLogged;
    for(const row of rows)row.dataset.justLogged='';
    highlightTimer=setTimeout(()=>rows.forEach(row=>delete row.dataset.justLogged),5500);
    const saved=$('#foodSavedFeedback'), label=$('#foodSavedText');
    const food=state.food.find(entry=>entry.id===draft.firstId);
    label.textContent=draft.total===1&&food?'Logged '+foodDisplayName(food.description):'Logged '+draft.total+' entries';
    saved.querySelector('#nativeEditSaved')?.remove();
    if(food&&rows.length===1){
      const edit=make('button','Edit','native-edit-saved');
      edit.type='button';edit.id='nativeEditSaved';
      edit.onclick=()=>{if(!busy&&ready)editFood(food)};
      saved.append(edit);
    }
    saved.hidden=false;
    first.focus({preventScroll:true});
    first.scrollIntoView({block:'nearest',behavior:'instant'});
  }
  async function saveMeal(draft) {
    if(busy||!ready||$('#day').value!==draft.day)return;
    writing=true;retryDraft=draft;busy=true;btnState();buttonState();
    $('#closeLogSheet').disabled=true;
    say('Saving meal…');
    let saved=false;
    try{
      await writeFoodDraft(draft);
      saved=true;
      await refresh();
      retryDraft=null;
      closeMenu();
      if(sheet.open)sheet.close();
    }catch{
      if(saved){
        retryDraft=null;ready=false;
        const message='Meal saved, but the log couldn’t refresh. Reload to see it.';
        if(sheet.open||!menu.hidden)say(message,true);else status(message,true);
      }else{
        const message='Couldn’t confirm the save. Retry to finish without adding duplicates.';
        say(message,true);if(!sheet.open&&menu.hidden)status(message,true);
      }
    }finally{
      writing=false;busy=false;btnState();buttonState();
    }
    if(saved&&ready){
      photoJob++;preparing=false;text.value='';file.value='';camera.value='';dictated=false;updatePhoto(null);
      showLoggedMeal(draft);
    }
  }

  async function saveWeight(kg,day){
    resetMic();writing=true;busy=true;btnState();buttonState();say('Saving weight…');
    let saved=false;
    try{
      await api('/api/weight',{day,kg});saved=true;
      await refresh();
      text.value='';dictated=false;
      closeMenu();
      if(sheet.open)sheet.close();
      const guide=firstMealGuide;
      if(guide?.stage==='weight'&&guide.day===day){guide.weightDay=day;showGuideStage('weight-saved')}
      showPlateToast('Logged '+roundKg(kg));
    }catch(error){
      if(saved){text.value='';ready=false}
      say(saved?'Weight saved. Refresh to see it.':error.message,true);
    }finally{writing=false;busy=false;btnState();buttonState()}
  }

  review.onclick=async()=>{
    if((!sheet.open&&menu.hidden)||busy||!ready||!$('#day').reportValidity())return;
    if(retryDraft){
      if($('#day').value!==retryDraft.day){
        say('Return to '+dateFullFmt.format(dateNum(retryDraft.day))+' to retry that save.',true);return;
      }
      await saveMeal(retryDraft);
      return;
    }
    const day=$('#day').value,weight=!selected&&parseWeighIn(text.value);
    if(weight){
      if(!weight.valid){say('Enter a weight between 20 and 800 kg.',true);return}
      await saveWeight(weight.kg,day);return;
    }
    if(!available){say('AI estimates are unavailable. Manual entry is in Settings.',true);return}
    const controller=new AbortController(),fromPlus=menu.contains(form);
    resetMic();
    run=controller;buttonState();say('Estimating meal…');
    try{
      if(selected&&text.value.trim()){
        say('Send the photo on its own, or remove it to send the text.');
        return;
      }
      const input=selected?{kind:'photo',photo:selected}:{kind:dictated?'transcript':'text',text:text.value};
      const result=await estimateMeal(input,provider,{signal:controller.signal});
      if(run!==controller||$('#day').value!==day||(fromPlus?menu.hidden:!sheet.open||$('#guidedFood').hidden))return;
      if(result.status==='unavailable'){
        say('Couldn’t identify this meal. Try adding a portion or ingredient.');
        return;
      }
      if(busy||!ready){say('Plate is busy. Tap Log meal again in a moment.');return}
      const rows=parseChatImport(JSON.stringify(result.rows));
      const pending=rows.map(row=>({row,id:crypto.randomUUID()}));
      const entryIds=pending.map(item=>item.id);
      await saveMeal({day,pending,entryIds,firstId:entryIds[0],total:rows.length,firstMeal:state.food.length===0});
    }catch(error){
      if(run===controller)say(error.message,true);
    }finally{
      if(run===controller){run=null;buttonState()}
    }
  };
}
