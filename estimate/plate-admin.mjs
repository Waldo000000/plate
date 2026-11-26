const ownCode=document.documentElement.dataset.plateAccount;
if(ownCode){
 const label=$('#plateAccountCode');
 label.textContent='Account code: '+ownCode;
 label.hidden=false;
}
if(document.body.hasAttribute('data-plate-admin'))wirePlateAdmin();
function wirePlateAdmin(){
 const panel=$('#plateAccounts'),list=$('#plateAccountList'),more=$('#plateAccountsMore'),feedback=$('#plateAccountsStatus');
 panel.hidden=false;
 let tail=null,active=false;
 const endpoint='/api/admin/accounts';
 const quotas=$('#plateQuotaForm'),quotaStatus=$('#plateQuotaStatus'),quotaInputs=[...quotas.querySelectorAll('input')],quotaSave=quotas.querySelector('button');
 const setQuotaForm=(policy,disabled=false)=>{
  if(policy)for(const field of quotaInputs)field.value=policy[field.name];
  for(const field of [...quotaInputs,quotaSave])field.disabled=disabled;
 };
 async function loadQuotas(){
  setQuotaForm(null,true);
  try{const {policy}=await api(endpoint+'/limits');setQuotaForm(policy);quotaStatus.textContent=''}
  catch(error){quotaStatus.textContent=error.message}
 }
 quotas.onsubmit=async event=>{
  event.preventDefault();if(!quotas.reportValidity())return;
  const values=Object.fromEntries(quotaInputs.map(field=>[field.name,field.valueAsNumber]));
  setQuotaForm(null,true);quotaStatus.textContent='Saving…';
  try{const {policy}=await api(endpoint+'/limits',values);setQuotaForm(policy);quotaStatus.textContent='Limits saved.'}
  catch(error){quotaStatus.textContent=error.message;setQuotaForm(null)}
 };
 const options={standard:'Standard',trusted:'Trusted',blocked:'Blocked'};
 const say=(value,err=false)=>{feedback.textContent=value;feedback.classList.toggle('err',err)};
 function accountRow(account){
  const row=make('li',undefined,'plate-account-row'),label=make('label'),code=make('code',account.public_id),control=document.createElement('select');
  control.className='input';
  for(const [key,value] of Object.entries(options)){const option=make('option',value);option.value=key;control.append(option)}
  control.value=account.role;
  label.append(account.email?make('strong',account.email):code,control);row.append(label);
  control.onchange=async()=>{
   const next=control.value;
   if(next==='blocked'&&!confirm('Block this account from Plate? You can undo this here.')){control.value=account.role;return}
   control.disabled=true;say('Saving…');
   try{const {account:saved}=await api(endpoint,{id:account.public_id,role:next});account=saved;say('Access updated.')}
   catch(error){control.value=account.role;say(error.message,true)}
   finally{control.disabled=false}
  };
  return row;
 }
 async function load(reset=false){
  if(active)return;
  active=true;more.disabled=true;say('Loading…');
  if(reset){tail=null;list.replaceChildren();more.hidden=true}
  try{
   const path=endpoint+(tail?'?'+new URLSearchParams({at:tail.joined_at,before:tail.public_id}):'');
   const result=await api(path);
   for(const account of result.accounts)list.append(accountRow(account));
   tail=result.accounts.at(-1)??tail;
   more.hidden=!result.more;say(list.childElementCount?'':'No other accounts have signed in yet.');
  }catch(error){say(error.message,true)}
  finally{active=false;more.disabled=false}
 }
 panel.ontoggle=()=>{if(panel.open){void load(true);void loadQuotas()}};
 more.onclick=()=>void load();
}
