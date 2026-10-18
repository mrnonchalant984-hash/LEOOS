export const CONTACT_SERVICES = [
  "Website, web app, or SaaS development",
  "AI mockup and visual direction",
  "Code review",
  "Other",
] as const;

/** Supported contact delivery strategies — choose explicitly; do not silently downgrade. */
export const CONTACT_DELIVERY_STRATEGIES = [
  {
    id: 'existing_email',
    label: 'Existing email provider (Resend or SMTP)',
    limitation: 'Requires configured SMTP or Resend credentials. Delivery must be verified separately from form save.',
  },
  {
    id: 'web3forms',
    label: 'Web3Forms',
    limitation: 'Uses a public access key. Form save can succeed while email delivery fails or is rate-limited.',
  },
  {
    id: 'database_only',
    label: 'Secure database-backed submission',
    limitation: 'Persists to Supabase contacts; does not guarantee email delivery.',
  },
  {
    id: 'temporary_no_email',
    label: 'Temporary form without email delivery',
    limitation: 'Acceptable only when the user approves that email notification is unavailable.',
  },
] as const;

export type ContactService = typeof CONTACT_SERVICES[number];

export type ContactSubmission = {
  name: string;
  email: string;
  service: ContactService;
  message: string;
};

export function validateContactSubmission(value: unknown):
  | { ok: true; data: ContactSubmission }
  | { ok: false; error: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, error: "Please complete the contact form." };
  }
  const input = value as Record<string, unknown>;
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const email = typeof input.email === "string" ? input.email.trim() : "";
  const service = typeof input.service === "string" ? input.service.trim() : "";
  const message = typeof input.message === "string" ? input.message.trim() : "";

  if (name.length < 2 || name.length > 120 || /[\u0000-\u001f\u007f]/.test(name)) {
    return { ok: false, error: "Enter your name (2–120 characters)." };
  }
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "Enter a valid email address." };
  }
  if (!CONTACT_SERVICES.includes(service as ContactService)) {
    return { ok: false, error: "Choose a service from the list." };
  }
  if (message.length < 10 || message.length > 12_000) {
    return { ok: false, error: "Write a message between 10 and 12,000 characters." };
  }

  return { ok: true, data: { name, email, service: service as ContactService, message } };
}
