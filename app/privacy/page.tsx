import { siteData } from "@/data/site";

export const metadata = {
  title: "Privacy Policy — LEO OS",
  description: "How LEO OS processes account, project, build, and hosting information.",
};
export default function Privacy() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-16">
      <article className="rounded-3xl border border-white/10 bg-white/[.04] p-7 md:p-10">
        <p className="text-sm font-bold text-yellow-300">LEO OS · LEGAL</p>
        <h1 className="mt-2 text-4xl font-black">Privacy Policy</h1>
        <p className="mt-3 text-sm text-zinc-500">
          Last updated: October 2, 2026
        </p>
        <p className="mt-6 leading-7 text-zinc-300">
          This policy explains how LEO OS processes information for accounts, AI-assisted project building, payments, deployment, hosting, support, and public contact forms.
        </p>
        <div className="mt-8 space-y-7 text-zinc-300 leading-7">
          <section>
            <h2 className="text-xl font-bold text-white">
              1. Information collected
            </h2>
            <p className="mt-2">
              Information may include account identifiers and email, profile details, prompts and project requirements, generated project source and build logs, deployment IDs and URLs, hosting status, usage/credit records, payment references and status, contact-form submissions, and relevant support communications. Do not submit secrets or sensitive personal information unless a feature specifically requires it.
            </p>
          </section>
          <section>
            <h2 className="text-xl font-bold text-white">
              2. How information is used
            </h2>
            <p className="mt-2">
              Information is used to authenticate users, provide Leo and plan-authorized builders, enforce usage limits, create and manage customer projects, verify payments, operate hosting, prevent abuse, provide support, and meet legal obligations. Customer prompts and requirements may be sent to configured AI providers to generate requested outputs.
            </p>
          </section>
          <section>
            <h2 className="text-xl font-bold text-white">
              3. Service providers and hosting
            </h2>
            <p className="mt-2">
              Depending on enabled features, LEO OS uses Supabase for authentication, database, and storage; OpenAI for AI and image generation; GitHub for customer project source repositories; Vercel for project builds and deployments; Paystack for payments; and configured email providers for notifications. Each provider processes data under its own terms. Customer project repositories and deployments are separate from the LEO OS production application.
            </p>
          </section>
          <section>
            <h2 className="text-xl font-bold text-white">
              4. Security and retention
            </h2>
            <p className="mt-2">
              LEO OS uses authenticated access controls and provider security features, but no online service can guarantee absolute security. Account, project, build, deployment, and payment records may be retained while needed to provide the service, maintain operational history, resolve disputes, and meet legal obligations. Contact support to request deletion, subject to those obligations and provider retention limits.
            </p>
          </section>
          <section>
            <h2 className="text-xl font-bold text-white">
              5. Your choices and contact
            </h2>
            <p className="mt-2">
              You may request access to, correction of, or deletion of personal
              information, subject to legal and contractual requirements.
              Contact me at{" "}
              <a
                className="text-yellow-300 underline"
                href={`mailto:${siteData.email}`}
              >
                {siteData.email}
              </a>{" "}
              or through the WhatsApp link on this site.
            </p>
          </section>
          <section>
            <h2 className="text-xl font-bold text-white">6. Updates</h2>
            <p className="mt-2">
              This policy may be updated when services or legal requirements
              change. The current version and its effective date will be posted
              on this page.
            </p>
          </section>
        </div>
      </article>
    </main>
  );
}
