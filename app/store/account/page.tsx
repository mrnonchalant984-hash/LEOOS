import Link from 'next/link';

export const metadata = { title: 'Buyer account | LeoX Store', robots: { index: false, follow: false } };

const accountCards = [
  { title: 'Your orders', description: 'Check order status, manage cancellations, and view receipts.', href: '/store/orders', action: 'View orders' },
  { title: 'Messages', description: 'Continue conversations with sellers about products and orders.', href: '/store/messages', action: 'Open messages' },
  { title: 'Shopping cart', description: 'Review items you are considering before checkout.', href: '/store/cart', action: 'Open cart' },
];

export default function BuyerAccountPage() {
  return <main className="mx-auto min-h-[70vh] max-w-6xl px-5 py-12 sm:px-8">
    <p className="text-xs font-bold uppercase tracking-[.2em] text-[#c8501c]">LeoX Store · Buyer workspace</p>
    <h1 className="mt-3 text-4xl font-black tracking-tight text-stone-900">Your buyer account</h1>
    <p className="mt-3 max-w-2xl leading-7 text-stone-600">Manage your shopping activity here. Seller tools have their own workspace, so your buyer orders and conversations stay easy to find.</p>
    <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {accountCards.map(card => <article key={card.href} className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm"><h2 className="text-lg font-bold text-stone-900">{card.title}</h2><p className="mt-2 min-h-12 text-sm leading-6 text-stone-600">{card.description}</p><Link href={card.href} className="mt-4 inline-flex rounded-lg bg-[#201a14] px-4 py-2.5 text-sm font-semibold text-white">{card.action}</Link></article>)}
      <article className="rounded-2xl border border-amber-200 bg-amber-50 p-5"><h2 className="text-lg font-bold text-stone-900">Want to sell?</h2><p className="mt-2 min-h-12 text-sm leading-6 text-stone-600">Open the separate seller workspace and submit your details for verification.</p><Link href="/store/seller" className="mt-4 inline-flex rounded-lg bg-[#eb6a2e] px-4 py-2.5 text-sm font-semibold text-white">Open seller workspace</Link></article>
    </div>
    <div className="mt-8 rounded-2xl border border-stone-200 bg-white p-6">
      <h2 className="text-lg font-bold text-stone-900">Continue shopping</h2>
      <p className="mt-2 text-sm leading-6 text-stone-600">Browse the marketplace and discover products from independent sellers.</p>
      <Link href="/store" className="mt-4 inline-flex rounded-lg bg-[#201a14] px-4 py-2.5 text-sm font-semibold text-white">Shop LeoX Store</Link>
      <Link href="/auth?mode=login&next=%2Fstore%2Faccount" className="ml-3 mt-4 inline-flex rounded-lg border border-stone-300 px-4 py-2.5 text-sm font-semibold text-stone-700">Sign in to your account</Link>
    </div>
  </main>;
}
