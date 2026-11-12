'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

export function PaymentReturnClient({ reference }: { reference: string }) {
  const [message, setMessage] = useState('Confirming payment with Paystack…');
  useEffect(() => { let active = true; fetch(`/api/store/orders/verify?reference=${encodeURIComponent(reference)}`, { method: 'POST' }).then(async (response) => { const result = await response.json().catch(() => ({})); if (active) setMessage(response.ok ? 'Payment confirmed. Your order is ready.' : result.error ?? 'Payment is still being confirmed. Check your orders shortly.'); }).catch(() => { if (active) setMessage('Payment is still being confirmed. Check your orders shortly.'); }); return () => { active = false; }; }, [reference]);
  return <main className="mx-auto min-h-[65vh] max-w-2xl px-5 py-20 text-center"><h1 className="text-3xl font-semibold text-white">Checkout update</h1><p className="mt-4 text-white/65" role="status">{message}</p><Link href="/store/orders" className="mt-7 inline-flex rounded-xl bg-amber-200 px-5 py-3 font-semibold text-neutral-950">View orders and receipts</Link></main>;
}
