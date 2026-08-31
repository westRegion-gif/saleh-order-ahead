'use client';

import { useEffect, useState } from 'react';
import './pos-machines.css';

const API=(process.env.NEXT_PUBLIC_API_URL||'http://localhost:3000/v1').replace(/\/$/,'');
type Row={branch:{id:string;code:string;nameAr:string;nameEn?:string|null;isActive:boolean};machine:{id:string;username:string;isActive:boolean;lastLoginAt?:string|null}|null};
type FormState={username:string;password:string};

export default function PosMachinesPage(){
 const [token,setToken]=useState('');
 const [ready,setReady]=useState(false);
 const [rows,setRows]=useState<Row[]>([]);
 const [forms,setForms]=useState<Record<string,FormState>>({});
 const [message,setMessage]=useState('');
 const [busy,setBusy]=useState('');

 useEffect(()=>{setToken(sessionStorage.getItem('lmtd_admin_token')||'');setReady(true)},[]);

 async function load(){
  if(!token)return;
  setBusy('load');
  try{
   const r=await fetch(`${API}/admin/pos-machines`,{headers:{Authorization:`Bearer ${token}`},cache:'no-store'});
   if(r.status===401){sessionStorage.removeItem('lmtd_admin_token');setToken('');return}
   if(!r.ok)throw new Error();
   const data:Row[]=await r.json();
   setRows(data);
   setForms(current=>{
    const next={...current};
    for(const row of data){
      const existing=next[row.branch.id];
      next[row.branch.id]={username:existing?.username||row.machine?.username||'',password:existing?.password||''};
    }
    return next;
   });
   setMessage('');
  }catch{setMessage('تعذر تحميل حسابات أجهزة الفروع.')}finally{setBusy('')}
 }

 useEffect(()=>{if(token)void load()},[token]);

 function change(branchId:string,key:keyof FormState,value:string){
  setForms(current=>({...current,[branchId]:{username:current[branchId]?.username||'',password:current[branchId]?.password||'',[key]:value}}));
 }

 async function save(row:Row){
  const form=forms[row.branch.id];
  if(!form?.username.trim()||form.password.length<6){setMessage('اكتب Username وكلمة مرور من 6 أحرف على الأقل.');return}
  setBusy(row.branch.id);setMessage('');
  try{
   const r=await fetch(`${API}/admin/pos-machines/${row.branch.id}`,{
    method:'PUT',
    headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
    body:JSON.stringify({username:form.username.trim(),password:form.password}),
   });
   const body=await r.json().catch(()=>null);
   if(!r.ok)throw new Error(Array.isArray(body?.message)?body.message.join(', '):body?.message||'تعذر حفظ الحساب.');
   setForms(current=>({...current,[row.branch.id]:{username:body.username||form.username.trim(),password:''}}));
   await load();
   setMessage(`تم حفظ حساب POS لفرع ${row.branch.nameEn||row.branch.nameAr}.`);
  }catch(e){setMessage(e instanceof Error?e.message:'تعذر حفظ الحساب.')}finally{setBusy('')}
 }

 async function toggle(row:Row){
  if(!row.machine)return;
  setBusy(row.branch.id);
  try{
   const r=await fetch(`${API}/admin/pos-machines/${row.branch.id}`,{
    method:'PATCH',
    headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
    body:JSON.stringify({isActive:!row.machine.isActive}),
   });
   if(!r.ok)throw new Error();
   await load();
  }catch{setMessage('تعذر تغيير حالة الحساب.')}finally{setBusy('')}
 }

 if(!ready)return null;
 if(!token)return <main className="pmLogin"><section><b>LMTD</b><h1>POS Machines</h1><p>Owner access is required.</p><a href="/">Go to owner login</a></section></main>;

 return <main className="pmPage">
  <header className="pmTop"><div><small>LMTD CONTROL</small><h1>Branch POS Accounts</h1><p>حدد اليوزر والباسورد لكل فرع واحفظه مباشرة.</p></div><div><a href="/live-orders">Staff / POS</a><a href="/">Owner console</a></div></header>
  {message&&<div className="pmNotice">{message}</div>}
  <section className="pmActions"><button onClick={()=>void load()} disabled={!!busy}>{busy==='load'?'Refreshing…':'Refresh'}</button></section>
  <section className="pmGrid">{rows.map(row=>{const form=forms[row.branch.id]||{username:row.machine?.username||'',password:''};return <article key={row.branch.id}>
   <header><div><small>{row.branch.code}</small><h2>{row.branch.nameEn||row.branch.nameAr}</h2></div><span className={row.machine?.isActive?'on':'off'}>{row.machine?.isActive?'ACTIVE':'NOT ACTIVE'}</span></header>
   <div className="pmForm">
    <label>Username<input value={form.username} onChange={e=>change(row.branch.id,'username',e.target.value)} placeholder="e.g. marsa-pos" autoComplete="off"/></label>
    <label>Password<input value={form.password} onChange={e=>change(row.branch.id,'password',e.target.value)} type="password" placeholder={row.machine?'Enter new password to save':'Choose password'} autoComplete="new-password"/></label>
    <button className="primary" onClick={()=>void save(row)} disabled={!!busy}>{busy===row.branch.id?'Saving…':row.machine?'Save / Update POS Account':'Create POS Account'}</button>
   </div>
   <div className="pmMeta"><span>Current username</span><b>{row.machine?.username||'Not created yet'}</b><span>Last login</span><b>{row.machine?.lastLoginAt?new Date(row.machine.lastLoginAt).toLocaleString('en-AE'):'Never'}</b></div>
   {row.machine&&<footer><button onClick={()=>void toggle(row)} disabled={!!busy}>{row.machine.isActive?'Disable account':'Enable account'}</button></footer>}
  </article>})}</section>
 </main>
}
