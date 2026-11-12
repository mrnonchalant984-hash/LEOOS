import Link from 'next/link';
import type { Metadata } from 'next';
import { adminSupabase } from '@/lib/auth';
import { formatProductPrice } from '@/lib/store/products';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'LeoX Store — Discover products across Africa',
  description: 'Explore products advertised by independent sellers across Africa. Buyers and sellers arrange payment and delivery directly.',
  alternates: { canonical: '/store' },
};

type StoreProduct = {
  slug: string;
  title: string;
  description: string;
  category: string;
  price: number;
  currency: string;
  condition: string;
  country_code: string;
  city: string;
  image_urls: string[];
};

export default async function StorePage({ searchParams }: PageProps<'/store'>) {
  const params = await searchParams;
  const term = (typeof params.q === 'string' ? params.q : '').trim().slice(0, 80);
  const category = (typeof params.category === 'string' ? params.category : '').trim().slice(0, 80);
  let products: StoreProduct[] = [];
  let unavailable = false;

  try {
    let query = adminSupabase().from('marketplace_products')
      .select('slug,title,description,category,price,currency,condition,country_code,city,image_urls')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(24);
    if (term) query = query.ilike('title', `%${term.replace(/[%_,]/g, ' ')}%`);
    if (category) query = query.eq('category', category);
    const result = await query;
    if (result.error) unavailable = true;
    else products = (result.data ?? []) as StoreProduct[];
  } catch {
    unavailable = true;
  }

  return (
    <main className="min-h-[75vh] px-5 py-12 sm:px-8">
      <div className="mx-auto max-w-7xl">
        <section className="rounded-[2rem] border border-white/10 bg-[radial-gradient(ellipse_at_top_right,rgba(212,175,55,.16),transparent_42%),linear-gradient(145deg,rgba(255,255,255,.07),rgba(255,255,255,.018))] p-7 sm:p-12">
          <p className="text-xs font-semibold uppercase tracking-[.24em] text-amber-200">LeoX Store · Africa</p>
          <h1 className="mt-5 max-w-3xl text-4xl font-semibold tracking-tight text-white sm:text-6xl">Discover what people are selling near you.</h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-white/65">Browse independent listings and contact sellers directly. Buyers and sellers arrange payment and delivery privately.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/store/seller/products/new" className="rounded-xl bg-amber-200 px-5 py-3 font-semibold text-neutral-950">Advertise a product</Link>
            <Link href="/store/seller" className="rounded-xl border border-white/15 px-5 py-3 font-medium text-white">Seller dashboard</Link>
            <Link href="/store/cart" className="rounded-xl border border-white/15 px-5 py-3 font-medium text-white">Shopping cart</Link>
            <Link href="/store/orders" className="rounded-xl border border-white/15 px-5 py-3 font-medium text-white">Orders and receipts</Link>
            <Link href="/auth?next=%2Fstore" className="rounded-xl border border-white/15 px-5 py-3 font-medium text-white">Sign in</Link>
          </div>
        </section>

        <section className="mt-12" aria-labelledby="store-listings">
          <div className="flex flex-wrap items-end justify-between gap-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[.2em] text-amber-200">Marketplace</p>
              <h2 id="store-listings" className="mt-2 text-2xl font-semibold text-white">Latest listings</h2>
            </div>
            <form action="/store" method="get" className="flex w-full max-w-xl gap-2">
              <label htmlFor="store-query" className="sr-only">Search product listings</label>
              <input id="store-query" name="q" defaultValue={term} placeholder="Search products" className="min-w-0 flex-1 rounded-xl border border-white/10 px-4 py-3 text-sm" />
              <button className="rounded-xl border border-white/15 px-4 py-3 text-sm font-medium text-white">Search</button>
            </form>
          </div>

          {unavailable ? (
            <div className="mt-7 rounded-2xl border border-rose-300/20 bg-rose-300/5 p-6 text-sm text-rose-100" role="status">
              Listings are temporarily unavailable. The Store database may not be configured or its migration may still be pending.
            </div>
          ) : products.length ? (
            <ul className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {products.map((product) => (
                <li key={product.slug}>
                  <Link href={`/store/product/${product.slug}`} className="block h-full rounded-2xl border border-white/10 bg-white/[.035] p-5 transition hover:-translate-y-0.5 hover:border-amber-200/30">
                    {product.image_urls?.[0] && <div role="img" aria-label={product.title} className="mb-4 aspect-[4/3] rounded-xl bg-cover bg-center" style={{ backgroundImage: `url("${product.image_urls[0]}")` }} />}
                    <p className="text-xs uppercase tracking-wider text-white/45">{product.category} · {product.condition}</p>
                    <h3 className="mt-3 text-lg font-semibold text-white">{product.title}</h3>
                    <p className="mt-2 line-clamp-2 text-sm leading-6 text-white/60">{product.description}</p>
                    <p className="mt-5 text-xl font-semibold text-amber-100">{formatProductPrice(Number(product.price), product.currency)}</p>
                    <p className="mt-2 text-xs text-white/45">{product.city}, {product.country_code}</p>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="mt-7 rounded-2xl border border-white/10 bg-white/[.025] p-8 text-center">
              <h3 className="text-lg font-semibold text-white">{term || category ? 'No matching listings yet' : 'No published listings yet'}</h3>
              <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-white/55">Approved public listings will appear here. Seller submissions are reviewed before publication.</p>
              <Link href="/store/seller/products/new" className="mt-5 inline-flex rounded-xl bg-amber-200 px-4 py-2.5 text-sm font-semibold text-neutral-950">Submit a listing</Link>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
