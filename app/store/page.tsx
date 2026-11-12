import Link from 'next/link';
import type { Metadata } from 'next';
import { adminSupabase } from '@/lib/auth';
import { formatProductPrice } from '@/lib/store/products';
import { getVerifiedStoreSellerIds } from '@/lib/store/seller-access';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'LeoX Market — Find your next good thing',
  description: 'Shop products from independent sellers across Africa on LeoX Market, by LeonardX.',
  alternates: { canonical: '/store' },
};

type StoreProduct = {
  slug: string; title: string; description: string; category: string; price: number;
  currency: string; condition: string; country_code: string; city: string; image_urls: string[];
};
const categoryStyle: Record<string, { icon: string; tone: string }> = {
  phones: { icon: '📱', tone: 'from-orange-100 to-amber-50' },
  fashion: { icon: '👟', tone: 'from-pink-100 to-orange-50' },
  home: { icon: '🛋️', tone: 'from-lime-100 to-yellow-50' },
  computers: { icon: '💻', tone: 'from-blue-100 to-cyan-50' },
  beauty: { icon: '✨', tone: 'from-fuchsia-100 to-rose-50' },
  default: { icon: '🛍️', tone: 'from-amber-100 to-orange-50' },
};
function categoryPresentation(value: string) {
  const category = value.toLowerCase();
  const key = Object.keys(categoryStyle).find(name => category.includes(name) || (name === 'phones' && category.includes('mobile'))) ?? 'default';
  return categoryStyle[key];
}

export default async function StorePage({ searchParams }: PageProps<'/store'>) {
  const params = await searchParams;
  const term = (typeof params.q === 'string' ? params.q : '').trim().slice(0, 80);
  const category = (typeof params.category === 'string' ? params.category : '').trim().slice(0, 80);
  let products: StoreProduct[] = [];
  let unavailable = false;
  try {
    const verifiedSellerIds = await getVerifiedStoreSellerIds();
    if (!verifiedSellerIds) unavailable = true;
    else if (verifiedSellerIds.length) {
      let query = adminSupabase().from('marketplace_products')
        .select('slug,title,description,category,price,currency,condition,country_code,city,image_urls')
        .eq('status', 'active').in('seller_id', verifiedSellerIds).order('created_at', { ascending: false }).limit(36);
      if (term) query = query.ilike('title', `%${term.replace(/[%_,]/g, ' ')}%`);
      if (category) query = query.eq('category', category);
      const result = await query;
      if (result.error) unavailable = true;
      else products = (result.data ?? []) as StoreProduct[];
    }
  } catch { unavailable = true; }
  const categories = [...new Set(products.map(product => product.category).filter(Boolean))].slice(0, 8);
  const feature = products[0];

  return <main className="store-home px-4 pb-12 pt-5 sm:px-7 sm:pt-8">
    <div className="mx-auto max-w-[1500px]">
      <section className="store-hero grid overflow-hidden rounded-[2rem] bg-[#fffdf8] shadow-[0_18px_60px_rgba(78,54,29,.09)] lg:grid-cols-[1.08fr_.92fr]" aria-labelledby="market-welcome">
        <div className="flex flex-col justify-center px-6 py-10 sm:px-10 lg:px-14 lg:py-14">
          <p className="inline-flex w-fit items-center gap-2 rounded-full bg-[#fff0e8] px-4 py-2 text-xs font-bold uppercase tracking-[.12em] text-[#c8501c]"><span className="size-2 rounded-full bg-[#eb6a2e]"/> LeoX Market · across Africa</p>
          <h1 id="market-welcome" className="mt-6 max-w-2xl text-4xl font-black leading-[1.03] tracking-tight text-stone-950 sm:text-5xl lg:text-6xl">Good finds are closer than you think.</h1>
          <p className="mt-5 max-w-xl text-base leading-7 text-stone-600 sm:text-lg">Explore phones, fashion, home essentials and more from independent sellers in your community.</p>
          <div className="mt-8 flex flex-wrap gap-3"><a href="#latest" className="rounded-xl bg-[#eb6a2e] px-6 py-3.5 text-sm font-bold text-white shadow-md shadow-orange-900/10 transition hover:bg-[#d95b21]">Explore products <span aria-hidden>→</span></a><Link href="/store/seller" className="rounded-xl border border-stone-300 bg-white px-6 py-3.5 text-sm font-bold text-stone-800 transition hover:border-stone-500">Seller workspace</Link></div>
          <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-xs font-medium text-stone-500"><span>✓ Independent local sellers</span><span>✓ Clear product details</span><span>✓ Shop at your pace</span></div>
        </div>
        <div className="store-hero-art relative min-h-[300px] overflow-hidden bg-[#f4d8bd] sm:min-h-[390px] lg:min-h-[470px]">
          {feature?.image_urls?.[0] ? <div role="img" aria-label={feature.title} className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `linear-gradient(90deg,rgba(41,26,18,.08),rgba(41,26,18,.02)),url("${feature.image_urls[0]}")` }} /> : <div aria-hidden className="absolute inset-0 bg-[radial-gradient(circle_at_78%_28%,#ffd690_0,transparent_27%),radial-gradient(circle_at_32%_75%,#ec8d58_0,transparent_38%),linear-gradient(135deg,#f8dcb9,#e9ad7b)]"><div className="absolute right-[10%] top-[11%] grid size-32 rotate-6 place-items-center rounded-[2.5rem] bg-white/75 text-6xl shadow-xl backdrop-blur sm:size-44 sm:text-8xl">🛍️</div><div className="absolute bottom-[17%] left-[12%] grid size-24 -rotate-6 place-items-center rounded-[2rem] bg-[#fff5e7] text-5xl shadow-xl sm:size-32 sm:text-7xl">✨</div><div className="absolute bottom-[15%] right-[14%] grid size-20 rotate-12 place-items-center rounded-[1.7rem] bg-[#de6b40] text-4xl shadow-xl sm:size-28 sm:text-6xl">📦</div></div>}
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-stone-950/75 via-stone-950/20 to-transparent p-6 pt-24 sm:p-9 sm:pt-28">
            {feature ? <Link href={`/store/product/${feature.slug}`} className="block max-w-lg text-white"><span className="rounded-full bg-white/90 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-[#c8501c]">Fresh on LeoX</span><h2 className="mt-4 text-2xl font-bold sm:text-3xl">{feature.title}</h2><p className="mt-1 text-sm text-white/85">{feature.city}, {feature.country_code} <span aria-hidden>·</span> {formatProductPrice(Number(feature.price), feature.currency)}</p></Link> : <div className="text-white"><span className="rounded-full bg-white/90 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-[#c8501c]">Made for everyday discovery</span><p className="mt-4 max-w-md text-2xl font-bold sm:text-3xl">Your next favourite thing is waiting.</p></div>}
          </div>
          <div className="absolute right-5 top-5 rounded-2xl border border-white/50 bg-white/75 px-4 py-3 shadow-lg backdrop-blur"><p className="text-[10px] font-bold uppercase tracking-widest text-stone-500">Proudly local</p><p className="mt-0.5 text-sm font-extrabold text-stone-900">by LeonardX</p></div>
        </div>
      </section>

      <section className="mt-9" aria-labelledby="departments-title"><div className="mb-4 flex items-end justify-between"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-[#c8501c]">Browse your way</p><h2 id="departments-title" className="mt-1 text-2xl font-extrabold tracking-tight text-stone-900">Shop by department</h2></div><Link href="#latest" className="text-sm font-bold text-[#c8501c]">See everything <span aria-hidden>→</span></Link></div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">{(categories.length ? categories : ['Phones & tablets','Fashion','Home & living','Computers','Beauty & care','More to explore']).map(name => { const style = categoryPresentation(name); return <Link key={name} href={`/store?category=${encodeURIComponent(name)}`} className={`group flex min-h-32 flex-col justify-between rounded-2xl bg-gradient-to-br ${style.tone} p-4 transition hover:-translate-y-1 hover:shadow-lg sm:min-h-36 sm:p-5`}><span className="text-4xl transition group-hover:scale-110">{style.icon}</span><span className="text-sm font-extrabold leading-snug text-stone-800">{name}</span></Link>; })}</div>
      </section>

      <section className="mt-10 overflow-hidden rounded-[1.6rem] bg-[#282119] px-6 py-7 text-white sm:flex sm:items-center sm:justify-between sm:px-9"><div><p className="text-xs font-bold uppercase tracking-[.2em] text-orange-300">Have something to sell?</p><h2 className="mt-2 text-2xl font-extrabold">Open your LeoX storefront</h2><p className="mt-1 text-sm text-white/70">Share your products with shoppers near you after seller verification.</p></div><Link href="/store/seller" className="mt-5 inline-flex rounded-xl bg-[#f8b35c] px-5 py-3 text-sm font-extrabold text-stone-950 sm:mt-0">Open seller workspace <span className="ml-2" aria-hidden>→</span></Link></section>

      <section id="latest" className="mt-11 scroll-mt-40" aria-labelledby="store-listings">
        <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-[#c8501c]">Handpicked from the marketplace</p><h2 id="store-listings" className="mt-1 text-3xl font-extrabold tracking-tight text-stone-900">{term || category ? 'Your search results' : 'Fresh finds for you'}</h2><p className="mt-1 text-sm text-stone-500">{products.length} {products.length === 1 ? 'product' : 'products'} to explore</p></div><form action="/store" method="get" className="flex w-full max-w-sm gap-2 sm:w-auto"><label htmlFor="store-query" className="sr-only">Search product listings</label><input id="store-query" name="q" defaultValue={term} placeholder="Try “phone” or “chair”" className="min-w-0 flex-1 rounded-xl border border-stone-300 bg-white px-4 py-3 text-sm text-stone-900 placeholder:text-stone-400 sm:w-64"/><button className="rounded-xl bg-stone-900 px-5 py-3 text-sm font-bold text-white">Search</button></form></div>
        {categories.length > 0 && <nav className="mt-5 flex gap-2 overflow-x-auto pb-2" aria-label="Product filters"><Link href="/store" className={`whitespace-nowrap rounded-full px-4 py-2 text-xs font-bold ${!category ? 'bg-[#282119] text-white' : 'bg-white text-stone-600 ring-1 ring-stone-200'}`}>All products</Link>{categories.map(name => <Link key={name} href={`/store?category=${encodeURIComponent(name)}`} className={`whitespace-nowrap rounded-full px-4 py-2 text-xs font-bold ${category === name ? 'bg-[#282119] text-white' : 'bg-white text-stone-600 ring-1 ring-stone-200'}`}>{name}</Link>)}</nav>}
        {unavailable ? <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-800" role="status">Products are temporarily unavailable. Please try again in a little while.</div> : products.length ? <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{products.map(product => { const style = categoryPresentation(product.category); return <li key={product.slug}><Link href={`/store/product/${product.slug}`} className="group block h-full overflow-hidden rounded-2xl bg-white shadow-[0_3px_18px_rgba(70,50,30,.055)] ring-1 ring-stone-200/70 transition hover:-translate-y-1 hover:shadow-xl">
          <div className={`relative aspect-[1/1] overflow-hidden bg-gradient-to-br ${style.tone}`}>{product.image_urls?.[0] ? <div role="img" aria-label={product.title} className="absolute inset-0 bg-cover bg-center transition duration-500 group-hover:scale-105" style={{ backgroundImage: `url("${product.image_urls[0]}")` }} /> : <div aria-hidden className="absolute inset-0 grid place-items-center text-7xl">{style.icon}</div>}<span className="absolute left-3 top-3 rounded-full bg-white/90 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-stone-700 shadow-sm">{product.condition}</span></div>
          <div className="p-4"><p className="text-[11px] font-bold uppercase tracking-wide text-stone-400">{product.category}</p><h3 className="mt-1 line-clamp-2 min-h-11 text-[15px] font-bold leading-5 text-stone-900">{product.title}</h3><p className="mt-3 text-xl font-black tracking-tight text-[#bd4e1e]">{formatProductPrice(Number(product.price), product.currency)}</p><p className="mt-2 flex items-center gap-1.5 text-xs text-stone-500"><span aria-hidden>📍</span>{product.city}, {product.country_code}</p></div>
        </Link></li>; })}</ul> : <div className="mt-6 rounded-2xl bg-white p-10 text-center shadow-sm ring-1 ring-stone-200"><div className="mx-auto grid size-16 place-items-center rounded-2xl bg-orange-50 text-3xl">🛍️</div><h3 className="mt-4 text-xl font-extrabold text-stone-900">{term || category ? 'No matching products yet' : 'Your next find is on its way'}</h3><p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-stone-500">New listings will show up here as sellers complete verification. Check back soon, or apply to sell.</p><Link href="/store/seller" className="mt-5 inline-flex rounded-xl bg-[#eb6a2e] px-5 py-3 text-sm font-bold text-white">Open seller workspace</Link></div>}
      </section>
    </div>
  </main>;
}
