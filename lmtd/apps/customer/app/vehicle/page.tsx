'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppScreen, Header } from '../_components';
import { submitCheckout } from '../_checkout';

export default function Vehicle(){
  const router = useRouter();
  const [plate, setPlate] = useState('');
  const [emirate, setEmirate] = useState('Abu Dhabi');
  const [makeModel, setMakeModel] = useState('');
  const [color, setColor] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function submit(){
    if (!plate.trim()) { setError('أدخل رقم اللوحة'); return; }
    setLoading(true); setError('');
    try {
      const order = await submitCheckout({
        pickupMethod: 'VEHICLE',
        vehiclePlate: plate,
        vehicleEmirate: emirate,
        vehicleMakeModel: makeModel || undefined,
        vehicleColor: color || undefined,
      });
      router.push(`/payment?order=${order.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر إنشاء الطلب');
    } finally { setLoading(false); }
  }

  return <AppScreen><Header title="مركبتك" back="/pickup"/><div className="content" dir="rtl"><p className="kicker">DRIVE PICKUP</p><h1>أضف مركبتك</h1><p className="muted">نستخدم هذه المعلومات للتعرف عليك عند وصولك للفرع.</p><div className="formCard">
    <label>رقم اللوحة<input value={plate} onChange={(e)=>setPlate(e.target.value)} placeholder="مثال: 12345"/></label>
    <label>الإمارة<select value={emirate} onChange={(e)=>setEmirate(e.target.value)}><option>Abu Dhabi</option><option>Dubai</option><option>Sharjah</option><option>Ajman</option><option>Umm Al Quwain</option><option>Ras Al Khaimah</option><option>Fujairah</option></select></label>
    <label>نوع السيارة<input value={makeModel} onChange={(e)=>setMakeModel(e.target.value)} placeholder="مثال: Nissan Patrol"/></label>
    <label>لون السيارة<input value={color} onChange={(e)=>setColor(e.target.value)} placeholder="مثال: أسود"/></label>
  </div>
    {error && <p>{error}</p>}
    <button className="blackCta" type="button" onClick={submit} disabled={loading}>{loading ? 'جاري إنشاء الطلب...' : 'حفظ ومتابعة للدفع'} <span>←</span></button>
    <Link className="textLink" href="/pickup">الرجوع لطريقة الاستلام</Link>
  </div></AppScreen>
}
