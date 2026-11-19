"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const services = [
  "Website, web app, or SaaS development",
  "AI mockup and visual direction",
  "Code review",
  "Other",
] as const;

const schema = z.object({
  name: z.string().min(2, "Please enter your name").max(120),
  email: z.string().email("Please enter a valid email"),
  service: z.enum(services),
  message: z.string().min(10, "Please enter at least 10 characters").max(12000),
});
type FormData = z.infer<typeof schema>;

export default function ContactForm() {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { service: "Other" },
  });

  const submit = async (data: FormData) => {
    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.ok !== true || result.saved !== true) {
        throw new Error(result.error || "Your message could not be submitted. Please try again.");
      }

      let emailSent = result.emailSent === true;
      if (!emailSent) {
        const accessKey = process.env.NEXT_PUBLIC_WEB3FORMS_ACCESS_KEY;
        if (accessKey) {
          const fallback = await fetch("https://api.web3forms.com/submit", {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({
              access_key: accessKey,
              name: data.name,
              email: data.email,
              subject: `New Braverton contact: ${data.service}`,
              message: data.message,
            }),
          });
          const fallbackResult = await fallback.json().catch(() => ({}));
          emailSent = fallback.ok && fallbackResult.success === true;
        }
      }

      if (emailSent) {
        toast.success("Message sent. Email notification was accepted by the delivery provider.");
      } else {
        toast.warning("Your message was saved, but email delivery could not be confirmed. The team can follow up from the dashboard.");
      }
      reset();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Contact submission failed. Please try again.");
    }
  };

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-5">
      <div>
        <label className="mb-2 block text-sm font-semibold">Name</label>
        <Input {...register("name")} placeholder="Your name" />
        {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>}
      </div>
      <div>
        <label className="mb-2 block text-sm font-semibold">Email</label>
        <Input type="email" {...register("email")} placeholder="you@example.com" />
        {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>}
      </div>
      <div>
        <label className="mb-2 block text-sm font-semibold">Service</label>
        <select
          {...register("service")}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          {services.map((service) => <option key={service} value={service}>{service}</option>)}
        </select>
        {errors.service && <p className="mt-1 text-xs text-red-600">Please choose a service.</p>}
      </div>
      <div>
        <label className="mb-2 block text-sm font-semibold">Message</label>
        <Textarea {...register("message")} placeholder="Tell us what you want to build..." />
        {errors.message && <p className="mt-1 text-xs text-red-600">{errors.message.message}</p>}
      </div>
      <Button type="submit" disabled={isSubmitting} className="w-full">
        {isSubmitting ? "Sending..." : "Send Message"}
      </Button>
    </form>
  );
}
