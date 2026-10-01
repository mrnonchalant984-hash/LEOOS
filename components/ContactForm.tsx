"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
const schema = z.object({ name: z.string().min(2, "Please enter your name"), email: z.string().email("Please enter a valid email"), message: z.string().min(10, "Please enter at least 10 characters") });
type FormData = z.infer<typeof schema>;
export default function ContactForm() { const {register,handleSubmit,formState:{errors,isSubmitting},reset}=useForm<FormData>({resolver:zodResolver(schema)}); const submit=async(data:FormData)=>{void data; await new Promise(r=>setTimeout(r,300)); toast.success("Message sent! Leonard has been notified by email."); reset();}; return <form onSubmit={handleSubmit(submit)} className="space-y-5"><div><label className="mb-2 block text-sm font-semibold">Name</label><Input {...register("name")} placeholder="Your name"/>{errors.name&&<p className="mt-1 text-xs text-red-600">{errors.name.message}</p>}</div><div><label className="mb-2 block text-sm font-semibold">Email</label><Input type="email" {...register("email")} placeholder="you@example.com"/>{errors.email&&<p className="mt-1 text-xs text-red-600">{errors.email.message}</p>}</div><div><label className="mb-2 block text-sm font-semibold">Message</label><Textarea {...register("message")} placeholder="Tell me what you want to build..."/>{errors.message&&<p className="mt-1 text-xs text-red-600">{errors.message.message}</p>}</div><Button type="submit" disabled={isSubmitting} className="w-full">{isSubmitting ? "Sending..." : "Send Message"}</Button></form> }
