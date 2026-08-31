'use client';

import { useEffect, useState } from 'react';
import LiveOrdersPanel from '../LiveOrdersPanel';
import './live-orders.css';

export default function LiveOrdersPage(){
 const [token,setToken]=useState<string|null>(null);
 useEffect(()=>{setToken(sessionStorage.getItem('lmtd_admin_token')||'')},[]);
 if(token===null)return null;
 if(!token)return <main className="liveLogin"><section><b>LMTD</b><h1>Staff / POS</h1><p>Owner sign-in is required before opening live operations.</p><a href="/">Go to owner login</a></section></main>;
 return <main className="livePage"><LiveOrdersPanel token={token}/></main>;
}
