import Link from 'next/link';
import { notFound } from 'next/navigation';
import { adminSupabase } from '@/lib/auth';
import { formatProductPrice } from '@/lib/store/products';

export const dynamic = 'force-dynamic';

export default async function SellerStorefrontPage({ params }: PageProps<'/store/seller/[id]'>) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const db = adminSupabase();
  const { data: seller, error } = await db.from('marketplace_sellers').select('user_id,display_name,bio,country_code,is_verified').eq('user_id', id).maybeSingle();
  if (error || !seller) notFound();
  const [{ data: products }, { data: delivery }] = await Promise.all([
    db.from('marketplace_products').select('slug,title,category,price,currency,condition,city,image_urls').eq('seller_id', id).eq('status', 'active').order('published_at', { ascending: false }).limit(48),
    db.from('marketplace_delivery_options').select('id,name,details,price,currency').eq('seller_id', id).is('product_id', null).eq('active', true).limit(20),
  ]);
  return <main className="mx-auto min-h-[75vh] max-w-7xl px-5 py-12 sm:px-8"><Link href="/store" className="text-sm text-white/55">← LeoX Store</Link><header className="mt-6 rounded-3xl border border-white/10 bg-white/[.03] p-7 sm:p-10"><p className="text-xs font-semibold uppercase tracking-[.2em] text-amber-200">Seller storefront · {seller.country_code}</p><h1 className="mt-4 text-4xl font-semibold text-white">{seller.display_name}</h1>{seller.is_verified && <p className="mt-2 text-sm text-emerald-200">Verified seller</p>}{seller.bio && <p className="mt-4 max-w-3xl whitespace-pre-wrap leading-7 text-white/65">{seller.bio}</p>}</header>{delivery?.length ? <section className="mt-7 rounded-2xl border border-white/10 p-5"><h2 className="font-semibold text-white">Seller delivery options</h2><ul className="mt-3 grid gap-3 sm:grid-cols-2">{delivery.map((option) => <li key={option.id} className="rounded-xl bg-white/[.03] p-4"><p className="font-medium">{option.name} · {formatProductPrice(Number(option.price), option.currency)}</p><p className="mt-1 text-sm text-white/55">{option.details || 'Confirm coverage and timing with the seller.'}</p><p className="mt-2 text-xs text-white/40">Fee is indicative and is not collected during platform checkout.</p></li>)}</ul></section> : null}<section className="mt-10"><h2 className="text-2xl font-semibold text-white">Available listings</h2>{products?.length ? <ul className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{products.map((product) => <li key={product.slug}><Link href={`/store/product/${product.slug}`} className="block h-full rounded-2xl border border-white/10 p-5 hover:border-amber-200/30">{product.image_urls?.[0] && <div role="img" aria-label={product.title} className="mb-4 aspect-[4/3] rounded-xl bg-cover bg-center" style={{ backgroundImage: `url("${product.image_urls[0]}")` }} />}<p className="text-xs text-white/45">{product.category} · {product.condition}</p><h3 className="mt-2 font-semibold text-white">{product.title}</h3><p className="mt-3 text-lg font-semibold text-amber-100">{formatProductPrice(Number(product.price), product.currency)}</p><p className="mt-1 text-xs text-white/45">{product.city}</p></Link></li>)}</ul> : <p className="mt-5 rounded-2xl border border-white/10 p-6 text-white/55">This seller has no active listings right now.</p>}</section></main>;
}
