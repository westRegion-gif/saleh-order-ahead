'use client';

import { FormEvent, useEffect, useState } from 'react';
import LiveOrdersPanel from '../LiveOrdersPanel';
import './live-orders.css';

const API=(process.env.NEXT_PUBLIC_API_URL||'http://localhost:3000/v1').replace(/\/$/,'');
type Branch={id:string;code:string;nameAr:string;nameEn?:string|null};
type Actor={kind:'owner'}|{kind:'pos';username:string;branch:Branch};

export default function LiveOrdersPage(){
 const [ready,setReady]=useState(false);const [token,setToken]=useState('');const [actor,setActor]=useState<Actor|null>(null);const [error,setError]=useState('');
 useEffect(()=>{
  let cancelled=false;
  (async()=>{
   const pos=sessionStorage.getItem('lmtd_pos_token')||'';
   if(pos){
    try{const r=await fetch(`${API}/pos/auth/me`,{headers:{Authorization:`Bearer ${pos}`},cache:'no-store'});if(r.ok){const me=await r.json();if(!cancelled){setToken(pos);setActor({kind:'pos',username:me.username,branch:me.branch});setReady(true)}return}}catch{}
    sessionStorage.removeItem('lmtd_pos_token');
   }
   const owner=sessionStorage.getItem('lmtd_admin_token')||'';
   if(!cancelled){if(owner){setToken(owner);setActor({kind:'owner'})}setReady(true)}
  })();
  return()=>{cancelled=true};
 },[]);
 async function login(e:FormEvent<HTMLFormElement>){e.preventDefault();setError('');const f=new FormData(e.currentTarget);try{const r=await fetch(`${API}/pos/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:String(f.get('username')||''),password:String(f.get('password')||'')})});if(!r.ok){setError('اسم المستخدم أو كلمة المرور غير صحيحة.');return}const d=await r.json();sessionStorage.setItem('lmtd_pos_token',d.accessToken);setToken(d.accessToken);setActor({kind:'pos',username:d.user.username,branch:d.user.branch})}catch{setError('تعذر الاتصال بخدمة POS.')}}
 function signOut(){if(actor?.kind==='pos')sessionStorage.removeItem('lmtd_pos_token');setToken('');setActor(null)}
 if(!ready)return null;
 if(!token||!actor)return <main className="liveLogin"><section><b>LMTD</b><h1>Branch POS</h1><p>سجل دخول جهاز الفرع لعرض وتشغيل طلبات هذا الفرع فقط.</p><form onSubmit={login}><label>POS Username<input name="username" autoComplete="username" required/></label><label>Password<input name="password" type="password" autoComplete="current-password" required/></label>{error&&<div className="liveNotice">{error}</div>}<button>Sign in to POS</button></form><a href="/">Owner login</a></section></main>;
 return <main className="livePage"><LiveOrdersPanel token={token} actor={actor} onSignOut={signOut}/></main>
}
