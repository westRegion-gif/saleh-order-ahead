'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppScreen, Header } from '../_components';
import { readCart } from '../_cart';
import { submitCheckout } from '../_checkout';
import { useLanguage } from '../_language';

export default function Vehicle() {
  const router = useRouter();
  const { language, dir } = useLanguage();
  const ar = language === 'ar';
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
      setError(ar ? 'أدخل رقم اللوحة' : 'Enter the plate number');
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
      setError(err instanceof Error ? err.message : (ar ? 'تعذر إنشاء الطلب' : 'Could not create order'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppScreen>
      <Header title="مركبتك" titleEn="Your vehicle" back="/pickup" />
      <div className="content" dir={dir}>
        <p className="kicker">DRIVE PICKUP</p>
        <h1>{ar ? 'أضف مركبتك' : 'Add your vehicle'}</h1>
        <p className="muted">{ar ? 'نستخدم هذه المعلومات للتعرف عليك عند وصولك للفرع.' : 'We use these details to identify you when you arrive at the branch.'}</p>
        <div className="formCard">
          <label>{ar ? 'رقم اللوحة' : 'Plate number'}<input value={plate} onChange={(event) => setPlate(event.target.value)} placeholder={ar ? 'مثال: 12345' : 'Example: 12345'} /></label>
          <label>{ar ? 'الإمارة' : 'Emirate'}<select value={emirate} onChange={(event) => setEmirate(event.target.value)}><option>Abu Dhabi</option><option>Dubai</option><option>Sharjah</option><option>Ajman</option><option>Umm Al Quwain</option><option>Ras Al Khaimah</option><option>Fujairah</option></select></label>
          <label>{ar ? 'نوع السيارة' : 'Make / model'}<input value={makeModel} onChange={(event) => setMakeModel(event.target.value)} placeholder="Nissan Patrol" /></label>
          <label>{ar ? 'لون السيارة' : 'Vehicle color'}<input value={color} onChange={(event) => setColor(event.target.value)} placeholder={ar ? 'مثال: أسود' : 'Example: Black'} /></label>
        </div>
        {error && <p>{error}</p>}
        <button className="blackCta" type="button" onClick={submit} disabled={loading}>{loading ? (ar ? 'جاري إنشاء الطلب...' : 'Creating order...') : (ar ? 'حفظ ومتابعة للدفع' : 'Save and continue to payment')} <span>←</span></button>
        <Link className="textLink" href="/pickup">{ar ? 'الرجوع لطريقة الاستلام' : 'Back to pickup method'}</Link>
      </div>
    </AppScreen>
  );
}
