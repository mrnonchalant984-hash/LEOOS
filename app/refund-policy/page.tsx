export const metadata = {
  title: "Refund Policy — Leonard Udoh",
  description:
    "Refund and cancellation terms for LEO OS subscriptions and hosting.",
};

export default function RefundPolicyPage() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-16">
      <article className="rounded-3xl border border-white/10 bg-white/[.04] p-8 md:p-10">
        <p className="text-sm font-bold text-yellow-300">
          LEO OS · LEGAL
        </p>
        <h1 className="text-4xl font-black">Refund Policy</h1>
        <p className="mt-3 text-sm text-zinc-500">
          Last updated: October 2, 2026
        </p>
        <p className="mt-6 leading-7 text-zinc-300">
          This policy applies to LEO OS subscriptions and separately paid hosting. Nothing here limits rights or remedies that cannot legally be excluded.
        </p>
        <div className="mt-8 space-y-7 leading-7 text-zinc-300">
          <section>
            <h2 className="text-xl font-bold text-white">
              1. AI Mockups — ₦50,000
            </h2>
            <p className="mt-2">
              An AI Mockup is a rapid, digital and consultative deliverable.
              Once the mockup and agreed accompanying materials have been
              delivered, the sale is final and is not refundable, except where a
              refund is required by applicable law or the deliverable was not
              provided as agreed.
            </p>
          </section>
          <section>
            <h2 className="text-xl font-bold text-white">
              2. Code Review / Audit — ₦20,000
            </h2>
            <p className="mt-2">
              A Code Review or Audit is a digital consultancy deliverable. Once
              the review, findings or agreed report has been delivered, the sale
              is final and is not refundable, except where required by
              applicable law or the service was not provided as agreed.
            </p>
          </section>
          <section>
            <h2 className="text-xl font-bold text-white">
              3. LEO OS subscriptions
            </h2>
            <p className="mt-2">
              Plans are prepaid and do not automatically renew. There is no recurring plan charge to cancel; access continues through the paid period and then expires unless another period is purchased. Contact support promptly about duplicate, unauthorized, or incorrectly processed charges. Refund requests are reviewed under applicable law and payment-provider rules.
            </p>
          </section>
          <section>
            <h2 className="text-xl font-bold text-white">
              4. Hosting after the 90-day trial
            </h2>
            <p className="mt-2">
              Each successfully deployed project receives one 90-day hosting trial. Hosting is not charged during the trial and does not automatically renew. After expiry, continued hosting requires an explicit renewal payment confirmed server-side. Contact support about duplicate or incorrectly processed hosting charges.
            </p>
          </section>
          <section>
            <h2 className="text-xl font-bold text-white">5. Requesting help</h2>
            <p className="mt-2">
              For a payment or delivery question, contact{" "}
              <a
                href="mailto:leonardudoh5@gmail.com"
                className="text-yellow-300 underline"
              >
                leonardudoh5@gmail.com
              </a>{" "}
              and include your project name and payment reference. Nothing in
              this policy limits consumer rights that cannot legally be
              excluded.
            </p>
          </section>
        </div>
      </article>
    </main>
  );
}
