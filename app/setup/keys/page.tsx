import { GlassCard } from "@/components/GlassCard";
const keys = [
  [
    "OpenAI API key",
    "Secret",
    "Powers a client-owned AI chatbot. The client pays OpenAI directly and controls its billing.",
    "Create a key in the OpenAI platform, add billing/limits, then paste it once into the secure deployment form.",
  ],
  [
    "Paystack public key",
    "Public",
    "Shows the payment interface. It is safe to expose as a public browser key.",
    "Copy it from Paystack Dashboard → Settings → API Keys.",
  ],
  [
    "Paystack secret key",
    "Secret",
    "Lets the server verify payments and webhooks automatically instead of trusting a browser response.",
    "Copy it from Paystack Dashboard → Settings → API Keys. Never put it in NEXT_PUBLIC_.",
  ],
  [
    "Supabase URL",
    "Public",
    "Tells the app which database project to use.",
    "Create/select the database project and copy the Project URL.",
  ],
  [
    "Supabase service role key",
    "Secret",
    "Allows trusted server operations. It must never be exposed to the browser.",
    "Copy it from Supabase API settings and store only as a server environment variable.",
  ],
  [
    "Web3Forms access key",
    "Public",
    "Delivers contact-page submissions without requiring a custom sender domain. Web3Forms access keys are designed for browser-side use.",
    "Create an access key in Web3Forms and add it to Vercel as NEXT_PUBLIC_WEB3FORMS_ACCESS_KEY, then redeploy.",
  ],
  [
    "Resend API key",
    "Secret",
    "Sends payment and hosting notification emails.",
    "Create a Resend API key and verify the sending domain/email.",
  ],
];
export default function Keys() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-12">
      <h1 className="text-4xl font-black">Keys & integrations</h1>
      <p className="mt-2 text-zinc-400">
        Leo explains every key before asking for it. Secrets are server-only and
        should never be committed to source code.
      </p>
      <div className="mt-8 space-y-4">
        {keys.map(([name, scope, why, how]) => (
          <GlassCard key={name} className="p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-xl font-bold">{name}</h2>
              <span className="rounded-full bg-white/10 px-3 py-1 text-xs">
                {scope}
              </span>
            </div>
            <p className="mt-3">
              <b>Why:</b> {why}
            </p>
            <p className="mt-2 text-sm text-zinc-400">
              <b>How:</b> {how}
            </p>
          </GlassCard>
        ))}
      </div>
    </main>
  );
}
