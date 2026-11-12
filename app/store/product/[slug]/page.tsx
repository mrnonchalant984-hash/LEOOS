import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { adminSupabase, getUserAccess } from '@/lib/auth';
import { formatProductPrice } from '@/lib/store/products';
import { serializeJsonLd, SITE_ORIGIN } from '@/lib/seo';
import { ProductActions } from '../product-actions';

export const dynamic = 'force-dynamic';

type Product = {
  id: string;
  seller_id: string;
  status: string;
  slug: string;
  title: string;
  description: string;
  category: string;
  price: number;
  currency: string;
  condition: string;
  country_code: string;
  region: string | null;
  city: string;
  published_at: string;
  image_urls: string[];
};

async function getProduct(slug: string, viewerId: string | null): Promise<Product | null> {
  try {
    const db = adminSupabase();
    const { data, error } = await db
      .from('marketplace_products')
      .select('id,seller_id,status,slug,title,description,category,price,currency,condition,country_code,region,city,published_at,image_urls')
      .eq('slug', slug)
      .maybeSingle();
    if (error) {
      console.error('Marketplace product lookup failed:', error.message);
      return null;
    }
    if (!data) return null;
    if (data.seller_id === viewerId) return data as Product;
    if (data.status !== 'active') return null;
    const { data: seller, error: sellerError } = await db.from('marketplace_sellers')
      .select('is_verified')
      .eq('user_id', data.seller_id)
      .maybeSingle();
    if (sellerError) {
      console.error('Marketplace seller verification lookup failed:', sellerError.message);
      return null;
    }
    if (!seller?.is_verified) return null;
    return data as Product | null;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: PageProps<'/store/product/[slug]'>): Promise<Metadata> {
  const { slug } = await params;
  const access = await getUserAccess();
  const product = await getProduct(slug, access?.user.id ?? null);
  if (!product) return { title: 'Listing unavailable | LeoX Store', robots: { index: false, follow: false } };
  if (product.status !== 'active') return { title: `${product.title} | Seller listing preview`, robots: { index: false, follow: false } };
  const description = product.description.slice(0, 155);
  const url = `${SITE_ORIGIN}/store/product/${product.slug}`;
  return {
    title: `${product.title} | LeoX Store`,
    description,
    alternates: { canonical: `/store/product/${product.slug}` },
    openGraph: { type: 'website', siteName: 'LeoX Store', title: product.title, description, url },
  };
}

export default async function ProductPage({ params }: PageProps<'/store/product/[slug]'>) {
  const { slug } = await params;
  const access = await getUserAccess();
  const product = await getProduct(slug, access?.user.id ?? null);
  if (!product) notFound();
  const isOwner = product.seller_id === access?.user.id;
  const [{ data: seller }, { data: deliveryOptions }] = await Promise.all([
    adminSupabase().from('marketplace_sellers').select('display_name,is_verified').eq('user_id', product.seller_id).maybeSingle(),
    adminSupabase().from('marketplace_delivery_options').select('name,details,price,currency').eq('seller_id', product.seller_id).is('product_id', null).eq('active', true).limit(10),
  ]);

  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.title,
    description: product.description,
    category: product.category,
    itemCondition: `https://schema.org/${product.condition === 'new' ? 'NewCondition' : product.condition === 'used' ? 'UsedCondition' : 'RefurbishedCondition'}`,
    offers: {
      '@type': 'Offer',
      url: `${SITE_ORIGIN}/store/product/${product.slug}`,
      price: Number(product.price).toFixed(2),
      priceCurrency: product.currency,
      availability: 'https://schema.org/InStock',
      areaServed: product.country_code,
    },
  };

  return (
    <main className="min-h-[75vh] px-5 py-12 sm:px-8">
      <article className="mx-auto max-w-5xl">
        <Link href="/store" className="text-sm text-white/55 hover:text-white">← Back to LeoX Store</Link>
        {isOwner && <section role="status" className="mt-5 rounded-2xl border border-amber-200/20 bg-amber-100/[.05] p-5"><p className="font-semibold text-amber-100">Seller-only listing preview · {product.status.replaceAll('_', ' ')}</p><p className="mt-1 text-sm leading-6 text-white/65">Only you can see this listing preview. Buyers will see your listing after it is approved and your seller account is verified.</p><Link href="/store/seller/products" className="mt-3 inline-flex text-sm font-semibold text-amber-100 underline">Manage your listings</Link></section>}
        <div className="mt-6 rounded-[2rem] border border-white/10 bg-white/[.025] p-6 sm:p-10">
          <div className="flex flex-wrap gap-2 text-xs font-medium uppercase tracking-wider text-amber-100/70">
            <span>{product.category}</span><span aria-hidden="true">·</span><span>{product.condition}</span>
          </div>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-5xl">{product.title}</h1>
          {product.image_urls?.length > 0 && <div className="mt-5 grid gap-3 sm:grid-cols-2">{product.image_urls.map((url) => <div key={url} role="img" aria-label={product.title} className="aspect-[4/3] rounded-2xl bg-cover bg-center" style={{ backgroundImage: `url("${url}")` }} />)}</div>}
          <p className="mt-5 text-3xl font-semibold text-amber-100">{formatProductPrice(Number(product.price), product.currency)}</p>
          <p className="mt-3 text-sm text-white/55">{[product.city, product.region, product.country_code].filter(Boolean).join(', ')}</p>
          <div className="mt-8 border-t border-white/10 pt-7">
            <h2 className="text-lg font-semibold text-white">Product details</h2>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-white/70">{product.description}</p>
          </div>
          <aside className="mt-8 rounded-2xl border border-amber-200/15 bg-amber-100/[.035] p-5">
            <h2 className="font-semibold text-white">Contact and delivery</h2>
            {seller && <p className="mt-2 text-sm text-white/65">Sold by {seller.is_verified ? <Link href={`/store/seller/${product.seller_id}`} className="underline">{seller.display_name}</Link> : seller.display_name}{seller.is_verified ? ' · Verified seller' : ''}</p>}
            {!isOwner && <p className="mt-2 text-sm leading-6 text-white/60">Pay securely through Paystack checkout for NGN listings. Confirm delivery coverage and timing with the seller; delivery fees are not included in checkout.</p>}
            {deliveryOptions?.length ? <ul className="mt-3 space-y-2 text-sm text-white/65">{deliveryOptions.map((option) => <li key={option.name}><strong>{option.name} · {formatProductPrice(Number(option.price), option.currency)}</strong>{option.details ? ` — ${option.details}` : ''}</li>)}</ul> : null}
            {isOwner ? <p className="mt-4 text-sm text-white/55">Buyer checkout and messaging are disabled in your own listing preview.</p> : <ProductActions productId={product.id} productSlug={product.slug} purchasable={product.currency === 'NGN'} />}
          </aside>
        </div>
        {product.status === 'active' && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(structuredData) }} />}
      </article>
    </main>
  );
}
