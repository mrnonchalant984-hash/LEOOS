export const metadata = {
  title: "Terms of Service — LEO OS",
  description: "Terms for the LEO OS development platform, plans, builds, and hosting.",
};
export default function Terms() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-16">
      <article className="rounded-3xl border border-white/10 bg-white/[.04] p-7 md:p-10">
        <p className="text-sm font-bold text-yellow-300">LEO OS · LEGAL</p>
        <h1 className="mt-2 text-4xl font-black">Terms of Service</h1>
        <p className="mt-3 text-sm text-zinc-500">
          Last updated: October 2, 2026
        </p>
        <p className="mt-6 leading-7 text-zinc-300">
          These terms apply to LEO OS accounts, subscriptions, project builders, generated project artifacts, and hosting services. LEO OS uses AI and third-party providers to assist with project creation. Available project types and usage are determined by the current plan and configured providers.
        </p>
        <div className="mt-8 space-y-7 text-zinc-300 leading-7">
          <section>
            <h2 className="text-xl font-bold text-white">
              1. Scope and written agreement
            </h2>
            <p className="mt-2">
              Before paid project work begins, the final scope, deliverables,
              price, dependencies and estimated timeline must be agreed in
              writing, such as by an accepted proposal or written confirmation.
              Changes to scope may affect fees and delivery dates and require
              written agreement.
            </p>
          </section>
          <section>
            <h2 className="text-xl font-bold text-white">
              2. Client responsibilities
            </h2>
            <p className="mt-2">
              You are responsible for providing accurate project information,
              timely feedback, required approvals, and content or assets you
              have permission to use. Delays in receiving these may move the
              agreed schedule.
            </p>
          </section>
          <section>
            <h2 className="text-xl font-bold text-white">
              3. Fees and payment
            </h2>
            <p className="mt-2">
              Subscription prices and included limits are shown on the existing pricing page. Plans are prepaid for the selected period and do not automatically renew. Building websites, web apps, and SaaS projects uses the applicable plan limits; customers do not purchase those builders as separate website-development products. A 90-day hosting trial begins after a successful project deployment. Continued hosting after that trial is a separate paid service and is not charged automatically.
            </p>
          </section>
          <section>
            <h2 className="text-xl font-bold text-white">
              4. Delivery and acceptance
            </h2>
            <p className="mt-2">
              Build and deployment status is reported from connected providers. A project is described as live only after the deployment provider confirms it is ready and returns a URL. Hosting, domains, third-party subscriptions, and usage beyond plan limits may require separate configuration or payment.
            </p>
          </section>
          <section>
            <h2 className="text-xl font-bold text-white">
              5. Intellectual property
            </h2>
            <p className="mt-2">
              You retain rights to materials you provide and are responsible for having permission to use them. Generated project source may be stored in a customer-specific repository when GitHub integration is configured. Third-party provider terms apply to their services and artifacts.
            </p>
          </section>
          <section>
            <h2 className="text-xl font-bold text-white">
              6. AI-assisted work
            </h2>
            <p className="mt-2">
              Generated output may contain errors and requires review before production use. LEO OS does not invent or verify customer credentials, regulated claims, or supplied facts. Customers must review code, content, security, legal obligations, and third-party dependencies before launch.
            </p>
          </section>
          <section>
            <h2 className="text-xl font-bold text-white">
              7. Liability and applicable rights
            </h2>
            <p className="mt-2">
              Nothing in these terms excludes rights or remedies that cannot
              legally be excluded. To the extent permitted by law, I am not
              responsible for indirect losses or interruptions caused by
              third-party hosting, payment, domain or software providers beyond
              my reasonable control.
            </p>
          </section>
          <section>
            <h2 className="text-xl font-bold text-white">8. Contact</h2>
            <p className="mt-2">
              Questions about a proposal or these terms can be sent to{" "}
              <a
                className="text-yellow-300 underline"
                href="mailto:leonardudoh5@gmail.com"
              >
                leonardudoh5@gmail.com
              </a>
              .
            </p>
          </section>
        </div>
      </article>
    </main>
  );
}
