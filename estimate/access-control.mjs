// The Sites gateway, never the client, supplies the identity passed here.
const roles=new Set(['standard','trusted','blocked']);
const roleResponse=(value,status=200)=>Response.json(value,{status,headers:{
 'cache-control':'private, no-store','x-content-type-options':'nosniff',
}});
const policyFields=['standard_daily','shared_daily','trusted_daily'];
async function plateQuotaPolicy(db){
 const row=await db.prepare('SELECT standard_daily,shared_daily,trusted_daily FROM plate_quota_policy WHERE singleton=1').first();
 if(!row)throw new Error('Quota policy unavailable');
 return row;
}
async function guestProfile(db,account,join,email){
 if(!db||!account||account.length>512)return null;
 const cleanEmail=typeof email==='string'&&email.length<=254&&/^[^\s@]+@[^\s@]+$/.test(email)?email:null;
 const query=()=>db.prepare('SELECT public_id,role,email FROM plate_accounts WHERE account_id=?').bind(account).first();
 const row=await query();
 if(!join||row?.role==='blocked'||(row&&(!cleanEmail||cleanEmail===row.email)))return row;
 // Eligible sign-ins supply the display email; stable identity remains the lookup key.
 await db.prepare(`INSERT INTO plate_accounts (account_id,public_id,email) VALUES (?,?,?)
   ON CONFLICT(account_id) DO UPDATE SET email=excluded.email WHERE role!='blocked' AND excluded.email IS NOT NULL`)
   .bind(account,crypto.randomUUID(),cleanEmail).run();
 return query();
}
async function plateAccountsAdmin(request,db,isOwner){
 if(!isOwner)return roleResponse({error:'Not found.'},404);
 if(!db)return roleResponse({error:'Account controls are temporarily unavailable.'},503);
 const url=new URL(request.url);
 try{
  if(request.method==='GET'){
   const before=url.searchParams.get('before');
   const day=url.searchParams.get('at');
   if(Boolean(before)!==Boolean(day)||(before&&!/^[0-9a-f-]{36}$/.test(before))||(day&&!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(day)))return roleResponse({error:'Invalid page.'},400);
   if(url.pathname.endsWith('/limits'))return roleResponse({policy:await plateQuotaPolicy(db)});
   const columns='SELECT public_id,role,joined_at,email FROM plate_accounts';
   const order=' ORDER BY joined_at DESC,public_id DESC LIMIT 51';
   const stmt=before?db.prepare(columns+' WHERE (joined_at,public_id)<(?,?)'+order).bind(day,before):db.prepare(columns+order);
   const {results}=await stmt.all();
   return roleResponse({accounts:results.slice(0,50),more:results.length>50});
  }
  if(request.method!=='POST')return roleResponse({error:'Use GET or POST.'},405);
  if(request.headers.get('origin')!==url.origin||!['same-origin',null].includes(request.headers.get('sec-fetch-site')))return roleResponse({error:'Only this dashboard can change access.'},403);
  const data=await input(request);
  if(url.pathname.endsWith('/limits')){
   const values=policyFields.map(key=>data[key]);
   if(Object.keys(data).length!==3||!values.every(v=>Number.isInteger(v)&&v>=1&&v<=300)||values[0]>Math.min(values[1],values[2])){
    return roleResponse({error:'Enter whole numbers from 1 to 300. The Standard limit can’t exceed the shared or Trusted limit.'},400);
   }
   const policy=await db.prepare('UPDATE plate_quota_policy SET standard_daily=?,shared_daily=?,trusted_daily=? WHERE singleton=1 RETURNING standard_daily,shared_daily,trusted_daily').bind(...values).first();
   if(!policy)throw new Error('Quota policy unavailable');
   return roleResponse({policy});
  }
  if(Object.keys(data).length!==2||!roles.has(data.role)||typeof data.id!=='string'||!/^[0-9a-f-]{36}$/.test(data.id))return roleResponse({error:'Choose a valid account and role.'},400);
  const result=await db.prepare('UPDATE plate_accounts SET role=? WHERE public_id=? RETURNING public_id,role,joined_at,email').bind(data.role,data.id).first();
  return result?roleResponse({account:result}):roleResponse({error:'Account not found.'},404);
 }catch(error){
  return roleResponse({error:error instanceof DataError?error.message:'Couldn’t update account access.'},error instanceof DataError?error.status:503);
 }
}
