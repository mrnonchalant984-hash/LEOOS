import { NextRequest, NextResponse } from "next/server";
import { getOpenAI, LEO_SYSTEM_PROMPT } from "@/lib/openai";
import { adminSupabase, getProfile, isPlatformOwner } from "@/lib/auth";
import { getPlanPrice } from "@/lib/pricing";
import { classifyAgents } from "@/lib/agents/manager";
import type { ProjectType } from "@/lib/pricing";
import { getBuilderAvailability } from "@/lib/builders/providers";
import { getEffectiveUserPlan, planAllows } from "@/lib/plan-access";
import { withOperationalMonitoring } from '@/lib/monitoring';
export const runtime = "nodejs";

function inferProjectType(message: string): ProjectType | null {
  const text = message.toLowerCase();
  if (/\b(mobile app|android app|ios app|iphone app|react native|expo app)\b/.test(text)) return "mobile_app";
  if (/\b(game|video game|2d platformer|racing game|puzzle game|godot)\b/.test(text)) return "game";
  if (/\b(saas|crm|marketplace|social platform|booking platform|school management system)\b/.test(text)) return "saas";
  if (/\b(web app|web application|management system|dashboard app)\b/.test(text)) return "web_app";
  if (/\b(website|web site|landing page|restaurant site|e-commerce site|portfolio site)\b/.test(text)) return "website";
  return null;
}

export async function GET(req: NextRequest) {
  const sid = req.nextUrl.searchParams.get("session_id");
  if (!sid) return NextResponse.json({ messages: [] });
  const ctx = await getProfile(req);
  if (!ctx) return NextResponse.json({ messages: [] });
  const db = adminSupabase();
  const { data } = await db
    .from("chats_v2")
    .select("messages")
    .eq("id", sid)
    .eq("user_id", ctx.user.id)
    .maybeSingle();
  const { data: sub } = await db
    .from("subscriptions")
    .select("plan,status,current_period_end")
    .eq("user_id", ctx.user.id)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const active =
    sub &&
    (!sub.current_period_end || new Date(sub.current_period_end) > new Date());
  return NextResponse.json({
    messages: data?.messages || [],
    profile: { full_name: ctx.profile.full_name },
    plan: active ? sub?.plan : null,
  });
}
export async function POST(req: NextRequest) {
  return withOperationalMonitoring(req, 'leo.ai.request', async ({ reportFailure }) => {
  try {
    const { session_id, message, mode = "normal" } = await req.json();
    if (!session_id || typeof message !== "string" || !message.trim())
      return NextResponse.json(
        { error: "Missing session or message" },
        { status: 400 },
      );
    const ctx = await getProfile(req);
    const db = ctx ? adminSupabase() : null;
    let history: Array<{ role: "user" | "assistant"; content: string }> = [];
    let existingChat = false;
    if (ctx && db) {
      const { data, error } = await db
        .from("chats_v2")
        .select("user_id,messages")
        .eq("id", session_id)
        .maybeSingle();
      if (error) throw error;
      if (data && data.user_id !== ctx.user.id)
        return NextResponse.json({ error: "Chat not found" }, { status: 404 });
      existingChat = Boolean(data);
      history = (data?.messages || []) as Array<{
        role: "user" | "assistant";
        content: string;
      }>;
    }
    let memories: any[] = [];
    if (ctx && db) {
      const { data } = await db
        .from("leo_memories")
        .select("memory")
        .eq("user_id", ctx.user.id)
        .eq("active", true)
        .order("updated_at", { ascending: false })
        .limit(20);
      memories = data || [];
    }
    const owner = isPlatformOwner(ctx?.profile);
    const requestedProjectType = inferProjectType(message);
    let projectBuilder: { projectType: ProjectType; status: string; message: string; href?: string; provider?: string } | undefined;
    let builderContext = "";
    if (requestedProjectType) {
      const provider = getBuilderAvailability(requestedProjectType);
      if (provider.status !== "ready") {
        projectBuilder = { projectType: requestedProjectType, status: "provider_unavailable", message: provider.message || "This build provider is not configured.", provider: provider.id };
      } else if (!ctx) {
        const setup = `/setup?project_type=${encodeURIComponent(requestedProjectType)}`;
        projectBuilder = { projectType: requestedProjectType, status: "sign_in_required", message: "Sign in to start this project.", href: `/auth?next=${encodeURIComponent(setup)}`, provider: provider.id };
      } else {
        const plan = await getEffectiveUserPlan(ctx.user.id, owner);
        const feature = requestedProjectType === "saas" ? "saas-builder" : requestedProjectType === "web_app" ? "web-app-builder" : "website-builder";
        if (!plan.projectTypes.includes(requestedProjectType) || !planAllows(plan, feature)) {
          projectBuilder = { projectType: requestedProjectType, status: "plan_upgrade", message: "This project type requires a plan upgrade.", href: "/pricing", provider: provider.id };
        } else {
          projectBuilder = { projectType: requestedProjectType, status: "ready", message: "Start project setup. Your project will be saved before building begins.", href: `/setup?project_type=${encodeURIComponent(requestedProjectType)}`, provider: provider.id };
        }
      }
      builderContext = `\nRequested project type: ${requestedProjectType}. Current builder state: ${projectBuilder.message} Never claim a project has been created, built, tested, or deployed until the corresponding operation confirms it.`;
    }
    const agentSuggestions = ctx
      ? classifyAgents(message, owner).map((a) => ({
          id: a.id,
          name: a.name,
          ownerOnly: a.ownerOnly,
          approvalRequired: a.approvalRequired,
        }))
      : [];
    const pricingContext =
      "\nCurrent LEO plan pricing from server configuration: " +
      JSON.stringify({
        standard: {
          monthly: getPlanPrice("standard", "monthly"),
          quarterly: getPlanPrice("standard", "quarterly"),
          yearly: getPlanPrice("standard", "yearly"),
        },
        pro: {
          monthly: getPlanPrice("pro", "monthly"),
          quarterly: getPlanPrice("pro", "quarterly"),
          yearly: getPlanPrice("pro", "yearly"),
        },
        unlimited: {
          monthly: getPlanPrice("unlimited", "monthly"),
          quarterly: getPlanPrice("unlimited", "quarterly"),
          yearly: getPlanPrice("unlimited", "yearly"),
        },
      }) +
      "\n";
    const memoryContext = memories.length
      ? "\nUser-approved persistent memories:\n" +
        memories.map((m: any) => "- " + m.memory).join("\n")
      : "";
    const system =
      LEO_SYSTEM_PROMPT +
      pricingContext +
      memoryContext +
      (owner
        ? "\nVerified owner: address the user as Boss Leonard 👑. Owner access is free and payment/credit checks are bypassed."
        : "") + builderContext;
    const ai = getOpenAI();
    let reply = "";
    let usage: any = null;
    try {
    if (requestedProjectType && projectBuilder) {
      reply = `I can help with a ${requestedProjectType.replaceAll("_", " ")} project. ${projectBuilder.message} I have not created or deployed a project yet.`;
    } else if (mode === "deep") {
      const response = await ai.responses.create({
        model: process.env.LEO_REASONING_MODEL || "gpt-5.6-luna",
        reasoning: { effort: "high" },
        input: [
          { role: "system", content: system },
          {
            role: "user",
            content: [
              ...history
                .slice(-20)
                .map((m) => ({
                  type: "input_text" as const,
                  text: `${m.role}: ${m.content}`,
                })),
              { type: "input_text" as const, text: message },
            ],
          },
        ],
      });
      reply = response.output_text || "I could not generate a reply.";
    } else {
      const response = await ai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: system },
          ...history.slice(-20),
          { role: "user", content: message },
        ],
        temperature: 0.7,
        max_tokens: 900,
      });
      reply =
        response.choices[0]?.message?.content ||
        "I could not generate a reply.";
      usage = response.usage;
    }
    } catch (error) {
      reportFailure(error, 'openai');
      throw error;
    }
    if (ctx && db && usage) {
      await db
        .from("ai_usage")
        .insert({
          user_id: ctx.user.id,
          feature: mode === "deep" ? "deep_reasoning" : "chat",
          model:
            mode === "deep"
              ? process.env.LEO_REASONING_MODEL || "gpt-5.6-luna"
              : "gpt-4o-mini",
          prompt_tokens: usage.prompt_tokens || 0,
          completion_tokens: usage.completion_tokens || 0,
          total_tokens: usage.total_tokens || 0,
          credits_used: 0,
          metadata: { session_id },
        });
    }
    if (ctx && db) {
      if (
        /^(remember|please remember|save this|keep in mind)/i.test(
          message.trim(),
        )
      ) {
        const memory = message
          .replace(
            /^(remember|please remember|save this|keep in mind)[:\s-]*/i,
            "",
          )
          .trim();
        if (memory)
          await db
            .from("leo_memories")
            .insert({ user_id: ctx.user.id, memory, source: "chat" });
      }
      const messages = [
        ...history,
        { role: "user" as const, content: message },
        { role: "assistant" as const, content: reply },
      ];
      const chat = {
        title: message.slice(0, 60),
        messages,
        updated_at: new Date().toISOString(),
      };
      const write = existingChat
        ? await db
            .from("chats_v2")
            .update(chat)
            .eq("id", session_id)
            .eq("user_id", ctx.user.id)
        : await db.from("chats_v2").insert({
            id: session_id,
            user_id: ctx.user.id,
            ...chat,
          });
      if (write.error) throw write.error;
    }
    return NextResponse.json({
      reply:
        owner && !reply.toLowerCase().startsWith("welcome back boss")
          ? `Welcome back Boss Leonard 👑\n\n${reply}`
          : reply,
      mode,
      agentSuggestions,
      projectBuilder,
    });
  } catch (e) {
    reportFailure(e);
    return NextResponse.json(
      { error: "Leo could not complete this request. Please try again." },
      { status: 500 },
    );
  }
  });
}
