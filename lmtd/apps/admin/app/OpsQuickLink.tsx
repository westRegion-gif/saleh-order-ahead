'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

export default function OpsQuickLink(){
  const pathname=usePathname();
  const [visible,setVisible]=useState(false);
  useEffect(()=>{const check=()=>setVisible(Boolean(sessionStorage.getItem('lmtd_admin_token')));check();const timer=setInterval(check,1000);return()=>clearInterval(timer)},[pathname]);
  if(!visible||pathname==='/live-orders')return null;
  return <a href="/live-orders" style={{position:'fixed',right:16,bottom:16,zIndex:1200,background:'#111',color:'#fff',padding:'12px 16px',borderRadius:999,textDecoration:'none',fontWeight:800,boxShadow:'0 10px 30px rgba(0,0,0,.22)'}}>Staff / POS</a>;
}
