'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppScreen, Header } from '../_components';
import { readCart } from '../_cart';
import { submitCheckout } from '../_checkout';

export default function Vehicle() {
  const router = useRouter();
  const [plate, setPlate] = useState('');
  const [emirate, setEmirate] = useState('Abu Dhabi');
  const [makeModel, setMakeModel] = useState('');
  const [color, setColor] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!readCart().length) router.replace('/cart');
  }, [router]);

  async function submit() {
    const cleanPlate = plate.trim();
    if (!cleanPlate) {
      setError('أدخل رقم اللوحة');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const order = await submitCheckout({
        pickupMethod: 'VEHICLE',
        vehiclePlate: cleanPlate,
        vehicleEmirate: emirate,
        vehicleMakeModel: makeModel.trim() || undefined,
        vehicleColor: color.trim() || undefined,
      });
      router.push(`/payment?order=${order.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر إنشاء الطلب');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppScreen>
      <Header title="مركبتك" back="/pickup" />
      <div className="content" dir="rtl">
        <p className="kicker">DRIVE PICKUP</p>
        <h1>أضف مركبتك</h1>
        <p className="muted">نستخدم هذه المعلومات للتعرف عليك عند وصولك للفرع.</p>
        <div className="formCard">
          <label>رقم اللوحة<input value={plate} onChange={(event) => setPlate(event.target.value)} placeholder="مثال: 12345" /></label>
          <label>الإمارة<select value={emirate} onChange={(event) => setEmirate(event.target.value)}><option>Abu Dhabi</option><option>Dubai</option><option>Sharjah</option><option>Ajman</option><option>Umm Al Quwain</option><option>Ras Al Khaimah</option><option>Fujairah</option></select></label>
          <label>نوع السيارة<input value={makeModel} onChange={(event) => setMakeModel(event.target.value)} placeholder="مثال: Nissan Patrol" /></label>
          <label>لون السيارة<input value={color} onChange={(event) => setColor(event.target.value)} placeholder="مثال: أسود" /></label>
        </div>
        {error && <p>{error}</p>}
        <button className="blackCta" type="button" onClick={submit} disabled={loading}>{loading ? 'جاري إنشاء الطلب...' : 'حفظ ومتابعة للدفع'} <span>←</span></button>
        <Link className="textLink" href="/pickup">الرجوع لطريقة الاستلام</Link>
      </div>
    </AppScreen>
  );
}
