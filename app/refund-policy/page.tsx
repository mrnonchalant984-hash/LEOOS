export const metadata = {
  title: 'Refund Policy — Leonard Udoh',
  description: 'Refund and cancellation terms for Leonard Udoh freelance web-development services.',
};

export default function RefundPolicyPage() {
  return <main className="mx-auto max-w-4xl px-4 py-16">
    <article className="rounded-3xl border border-white/10 bg-white/[.04] p-8 md:p-10">
      <p className="text-sm font-bold text-yellow-300">LEONARD UDOH · LEGAL</p>
      <h1 className="text-4xl font-black">Refund Policy</h1>
      <p className="mt-3 text-sm text-zinc-500">Last updated: October 2, 2026</p>
      <p className="mt-6 leading-7 text-zinc-300">This policy applies to AI Mockup, Code Review/Audit and bespoke website-development services provided by Leonard Udoh. The accepted written proposal and any rights that cannot legally be waived take precedence where applicable.</p>
      <div className="mt-8 space-y-7 leading-7 text-zinc-300">
        <section><h2 className="text-xl font-bold text-white">1. AI Mockups — ₦50,000</h2><p className="mt-2">An AI Mockup is a rapid, digital and consultative deliverable. Once the mockup and agreed accompanying materials have been delivered, the sale is final and is not refundable, except where a refund is required by applicable law or the deliverable was not provided as agreed.</p></section>
        <section><h2 className="text-xl font-bold text-white">2. Code Review / Audit — ₦20,000</h2><p className="mt-2">A Code Review or Audit is a digital consultancy deliverable. Once the review, findings or agreed report has been delivered, the sale is final and is not refundable, except where required by applicable law or the service was not provided as agreed.</p></section>
        <section><h2 className="text-xl font-bold text-white">3. Full websites — ₦350,000+</h2><p className="mt-2">Full website work is quoted after requirements, deliverables and schedule are agreed in writing. Payment is typically divided into a deposit and milestones. The deposit reserves a development calendar slot. If you cancel before design or coding begins, any refund of the deposit will account for the reserved time and work already performed, as set out in your written proposal. Once design or coding has actively begun, the deposit is non-refundable because the slot has been committed and project work has started. Any unpaid milestones for work not yet started are not due, unless your proposal states otherwise.</p></section>
        <section><h2 className="text-xl font-bold text-white">4. Changes, delays and cancellation</h2><p className="mt-2">Requests outside the agreed scope may require a revised quote and timeline. If work is delayed because required content, access, feedback or approvals are not supplied, the schedule may move. Contact me promptly if you need to pause or cancel so we can confirm the status of work and any amounts due under the written agreement.</p></section>
        <section><h2 className="text-xl font-bold text-white">5. Requesting help</h2><p className="mt-2">For a payment or delivery question, contact <a href="mailto:leonardudoh5@gmail.com" className="text-yellow-300 underline">leonardudoh5@gmail.com</a> and include your project name and payment reference. Nothing in this policy limits consumer rights that cannot legally be excluded.</p></section>
      </div>
    </article>
  </main>;
}