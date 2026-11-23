'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

type Product = { id: string; supplier_id: string; title: string; description: string; cost_kobo: number; currency: string; available_quantity: number; supplier: { business_name: string; country_code: string } | null };
type Application = { id: string; supplier_product_id: string; supplier_status: string; proposed_selling_price_kobo: number; supplier_note: string | null };
type Catalog = { products: Product[]; applications: Application[] };

export default function SupplierCatalogPage() {
  const [catalog, setCatalog] = useState<Catalog>({ products: [], applications: [] });
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [categories, setCategories] = useState<Record<string, string>>({});
  const [cities, setCities] = useState<Record<string, string>>({});
  const [countries, setCountries] = useState<Record<string, string>>({});
  const [termsAccepted, setTermsAccepted] = useState<Record<string, boolean>>({});
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');
  const load = useCallback(async () => {
    const response = await fetch('/api/store/suppliers/catalog', { cache: 'no-store' });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) { setError(result.error ?? 'Supplier catalogue is unavailable.'); return; }
    setCatalog(result); setError('');
  }, []);
  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [load]);
  async function apply(product: Product) {
    setBusy(product.id); setError(''); setNotice('');
    const price = Number(prices[product.id]);
    const response = await fetch('/api/store/suppliers/dropship', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        supplierProductId: product.id, sellingPriceKobo: price,
        category: categories[product.id] || 'General', countryCode: countries[product.id] || 'NG',
        city: cities[product.id] || '', termsAccepted: termsAccepted[product.id] === true,
      }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) setError(result.error ?? 'Application could not be submitted.');
    else { setNotice(result.message ?? 'Application submitted to supplier.'); await load(); }
    setBusy('');
  }
  const applicationByProduct = new Map(catalog.applications.map(item => [item.supplier_product_id, item]));
  return <main className="mx-auto min-h-screen max-w-6xl px-5 py-12 text-white sm:px-8">
    <Link href="/store/seller" className="text-sm text-white/55">← Seller workspace</Link>
    <p className="mt-6 text-xs font-semibold uppercase tracking-[.2em] text-amber-200">Braverton Market · Supplier network</p>
    <h1 className="mt-3 text-4xl font-semibold">Browse supplier inventory</h1>
    <p className="mt-3 max-w-3xl text-sm leading-6 text-white/60">Apply to approved suppliers to resell their products. Suppliers decide whether to accept each application. Approved applications create a paused listing that still needs Braverton product moderation. The supplier remains responsible for supplier-side fulfilment and courier arrangements.</p>
    {(error || notice) && <p role={error ? 'alert' : 'status'} className={`mt-5 text-sm ${error ? 'text-rose-200' : 'text-emerald-200'}`}>{error || notice}</p>}
    <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {catalog.products.map(product => {
        const application = applicationByProduct.get(product.id);
        return <article key={product.id} className="rounded-2xl border border-white/10 bg-white/[.03] p-5">
          <p className="text-xs text-amber-100">{product.supplier?.business_name ?? 'Approved supplier'} · {product.supplier?.country_code}</p>
          <h2 className="mt-2 text-lg font-semibold">{product.title}</h2>
          <p className="mt-2 line-clamp-3 text-sm text-white/55">{product.description}</p>
          <p className="mt-3 text-sm">Supplier cost: ₦{(product.cost_kobo / 100).toLocaleString('en-NG')} · Stock {product.available_quantity}</p>
          {application ? <div className="mt-4 rounded-xl bg-white/[.05] p-3"><p className="text-sm font-medium capitalize">Application: {application.supplier_status}</p><p className="mt-1 text-xs text-white/45">Proposed price ₦{(application.proposed_selling_price_kobo/100).toLocaleString('en-NG')}</p>{application.supplier_note && <p className="mt-2 text-xs text-amber-100">{application.supplier_note}</p>}</div> : <>
            <label className="mt-4 block text-sm">Your selling price (kobo)<input type="number" min={product.cost_kobo + 1} step="1" value={prices[product.id] ?? ''} onChange={event => setPrices(old => ({ ...old, [product.id]: event.target.value }))} className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2" /></label>
            <label className="mt-3 block text-sm">Category<input maxLength={80} value={categories[product.id] ?? ''} onChange={event => setCategories(old => ({ ...old, [product.id]: event.target.value }))} placeholder="e.g. Fashion" className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2" /></label>
            <label className="mt-3 block text-sm">Country code<input maxLength={2} value={countries[product.id] ?? 'NG'} onChange={event => setCountries(old => ({ ...old, [product.id]: event.target.value.toUpperCase() }))} className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2" /></label><label className="mt-3 block text-sm">Your listing city<input maxLength={100} value={cities[product.id] ?? ''} onChange={event => setCities(old => ({ ...old, [product.id]: event.target.value }))} className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2" /></label>
            <label className="mt-3 flex items-start gap-2 text-xs text-white/65"><input type="checkbox" checked={termsAccepted[product.id] === true} onChange={event => setTermsAccepted(old => ({ ...old, [product.id]: event.target.checked }))} className="mt-0.5" /><span>I accept Braverton dropship terms: the supplier decides whether to accept, and remains responsible for supplier-side fulfilment and courier arrangements.</span></label><button disabled={busy === product.id || !termsAccepted[product.id] || Number(prices[product.id]) <= product.cost_kobo || !(cities[product.id] ?? '').trim() || !/^[A-Za-z]{2}$/.test(countries[product.id] ?? 'NG')} onClick={() => void apply(product)} className="mt-4 w-full rounded-xl bg-amber-200 px-4 py-3 font-semibold text-neutral-950 disabled:opacity-50">{busy === product.id ? 'Submitting…' : 'Apply to supplier'}</button>
          </>}
        </article>;
      })}
    </div>
    {!catalog.products.length && !error && <p className="mt-8 rounded-2xl border border-white/10 p-8 text-white/55">No approved supplier products are available at the moment.</p>}
  </main>;
}
