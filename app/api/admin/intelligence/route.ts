import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase, requireOwner } from '@/lib/auth';

export const runtime = 'nodejs';
const COOKIE = 'leo_admin_device';
const PAGE = 1000;
const MAX = 20000;
const hash = (value: string) => createHash('sha256').update(value).digest('hex');

async function loadAll<T>(db: any, table: string, columns: string, order = 'created_at') {
  const result: T[] = [];
  for (let offset = 0; offset < MAX; offset += PAGE) {
    const { data, error } = await db.from(table).select(columns).order(order, { ascending: false }).range(offset, offset + PAGE - 1);
    if (error) return { data: result, error, truncated: false };
    const batch = (data || []) as T[];
    result.push(...batch);
    if (batch.length < PAGE) return { data: result, error: null, truncated: false };
  }
  return { data: result, error: null, truncated: true };
}
const num = (value: unknown) => {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
};
const moneyUnits = (value: unknown) => {
  const raw = String(value ?? '0');
  if (!/^-?\d+(?:\.\d+)?$/.test(raw)) return 0n;
  const negative = raw.startsWith('-');
  const [whole, fraction = ''] = raw.replace('-', '').split('.');
  const scaled = BigInt(whole) * 100000000n + BigInt((fraction + '00000000').slice(0, 8));
  return negative ? -scaled : scaled;
};
const moneyText = (scaled: bigint) => {
  const negative = scaled < 0n;
  const abs = negative ? -scaled : scaled;
  return `${negative ? '-' : ''}${abs / 100000000n}.${String(abs % 100000000n).padStart(8, '0')}`;
};
const sumMoney = (values: unknown[]) => values.reduce<bigint>((sum, value) => sum + moneyUnits(value), 0n);

type Usage = { id: string; user_id: string; feature: string; model: string | null; prompt_tokens: number; completion_tokens: number; total_tokens: number; credits_used: number; metadata: Record<string, unknown> | null; created_at: string };
type Payment = { id: string; user_id: string; reference: string | null; amount: string | number | null; amount_kobo: number | null; currency: string | null; plan: string | null; billing_period: string | null; status: string | null; paid_at: string | null; verified_at: string | null; refunded_at: string | null; created_at: string };
type Financial = { ai_usage_id: string; provider: string; model: string | null; service_tier: string; estimated_usd: string | null; actual_usd: string | null; usd_ngn_rate: string | null; estimated_ngn: string | null; actual_ngn: string | null; pricing_status: string; actual_cost_status: string };

export async function GET(req: NextRequest) {
  const owner = await requireOwner(req);
  if (!owner || !owner.profile.twofa_verified) return NextResponse.json({ error: 'Owner 2FA access required.' }, { status: 403 });
  const db = adminSupabase();
  const token = req.cookies.get(COOKIE)?.value;
  const trusted = token
    ? await db.from('admin_trusted_devices').select('id,expires_at,user_agent_hash').eq('user_id', owner.user.id).eq('token_hash', hash(token)).maybeSingle()
    : { data: null, error: null };
  const uaHash = hash(req.headers.get('user-agent') || 'unknown');
  if (!trusted.data || trusted.error || new Date(trusted.data.expires_at) <= new Date()
    || (trusted.data.user_agent_hash && trusted.data.user_agent_hash !== uaHash)) {
    return NextResponse.json({ error: 'Trusted administrator device verification is required.' }, { status: 403 });
  }

  const from = req.nextUrl.searchParams.get('from');
  const to = req.nextUrl.searchParams.get('to');
  const fromDate = from && /^\d{4}-\d{2}-\d{2}$/.test(from) ? new Date(`${from}T00:00:00.000Z`) : null;
  const toDate = to && /^\d{4}-\d{2}-\d{2}$/.test(to) ? new Date(`${to}T23:59:59.999Z`) : null;
  if ((from && !fromDate) || (to && !toDate) || (fromDate && toDate && fromDate > toDate)) {
    return NextResponse.json({ error: 'Invalid reporting date range.' }, { status: 400 });
  }

  const [usersQ, usageQ, paymentsQ, subsQ, hostingQ, buildsQ, previewsQ, runsQ, toolEventsQ, expensesQ, financialQ, renewalsQ, workflowQ] = await Promise.all([
    loadAll<any>(db, 'profiles', 'id,email,full_name,role,created_at'),
    loadAll<Usage>(db, 'ai_usage', 'id,user_id,feature,model,prompt_tokens,completion_tokens,total_tokens,credits_used,metadata,created_at'),
    loadAll<Payment>(db, 'payments', 'id,user_id,reference,amount,amount_kobo,currency,plan,billing_period,status,paid_at,verified_at,refunded_at,created_at'),
    loadAll<any>(db, 'subscriptions', 'id,user_id,plan,billing_period,status,current_period_start,current_period_end,starts_at,ends_at,payment_reference,cancel_at_period_end,canceled_at,created_at'),
    loadAll<any>(db, 'hosting_subscriptions', 'id,website_project_id,client_email,plan,status,starts_at,ends_at,next_renewal_at,paystack_reference,created_at', 'ends_at'),
    loadAll<any>(db, 'project_builds', 'id,website_project_id,owner_user_id,project_type,provider,status,step,error,deployment_id,deployment_url,created_at,started_at,completed_at'),
    loadAll<any>(db, 'cloudflare_preview_jobs', 'id,project_id,user_id,status,deployment_url,error_code,created_at,started_at,completed_at'),
    loadAll<any>(db, 'agent_runs', 'id,user_id,agent_id,task,status,error,metadata,started_at,completed_at,created_at'),
    loadAll<any>(db, 'bram_tool_events', 'id,user_id,session_id,request_id,tool_name,event_type,status,is_error,created_at'),
    loadAll<any>(db, 'business_expenses', 'id,category,description,amount,currency,amount_ngn,incurred_at,vendor,reference,created_at', 'incurred_at'),
    loadAll<Financial>(db, 'ai_usage_financials', 'ai_usage_id,provider,model,service_tier,estimated_usd,actual_usd,usd_ngn_rate,estimated_ngn,actual_ngn,pricing_status,actual_cost_status'),
    loadAll<any>(db, 'hosting_renewal_payments', 'reference,hosting_subscription_id,amount_kobo,currency,status,paid_at,created_at'),
    loadAll<any>(db, 'engineering_workflows', 'id,owner_user_id,website_project_id,mode,status,current_stage,title,created_at,updated_at'),
  ]);

  const required = [usersQ, usageQ, paymentsQ, subsQ, hostingQ, buildsQ, previewsQ, runsQ, toolEventsQ, expensesQ, financialQ, renewalsQ, workflowQ];
  const failed = required.find(item => item.error);
  if (failed) return NextResponse.json({ error: 'Owner intelligence data could not be loaded.', code: failed.error?.code || 'query_failed' }, { status: 503 });

  const inRange = (date: string) => (!fromDate || new Date(date) >= fromDate) && (!toDate || new Date(date) <= toDate);
  const users = usersQ.data || [];
  const profileMap = new Map(users.map((u: any) => [u.id, u]));
  const usages = (usageQ.data || []).filter((u: Usage) => inRange(u.created_at));
  const payments = paymentsQ.data || [];
  const successfulPayments = payments.filter((p: Payment) => p.status === 'success' && p.verified_at && inRange(p.paid_at || p.created_at));
  const paymentNgN = (p: Payment) => p.currency?.toUpperCase() === 'NGN'
    ? (p.amount_kobo !== null ? moneyUnits(String(p.amount_kobo)) / 100n : moneyUnits(p.amount))
    : 0n;
  const grossRevenue = sumMoney(successfulPayments.map(paymentNgN));
  const refundedRevenue = sumMoney(successfulPayments.filter(p => p.refunded_at && inRange(p.refunded_at)).map(paymentNgN));
  const netRevenue = grossRevenue - refundedRevenue;

  const financialMap = new Map((financialQ.data || []).map((f: Financial) => [f.ai_usage_id, f]));
  const eligibleUsages = usages.filter(u => !u.feature?.startsWith('image_'));
  const financials = eligibleUsages.map(u => financialMap.get(u.id)).filter(Boolean) as Financial[];
  const actualCostRows = financials.filter(f => f.actual_cost_status === 'provider_reported' || f.actual_cost_status === 'zero_confirmed');
  const actualAiCost = sumMoney(actualCostRows.map(f => f.actual_ngn));
  const actualCostComplete = actualCostRows.length === financials.length && financials.length > 0 && actualCostRows.every(f => f.actual_ngn !== null);
  const estimatedRows = financials.filter(f => f.estimated_ngn !== null && f.estimated_ngn !== undefined);
  const estimatedAiValue = sumMoney(estimatedRows.map(f => f.estimated_ngn));
  const estimatedCostComplete = estimatedRows.length === eligibleUsages.length && eligibleUsages.length > 0;
  const pricedRows = financials.filter(f => f.pricing_status === 'priced' || f.pricing_status === 'free_tier').length;
  const userUsage = new Map<string, any>();
  const featureUsage = new Map<string, any>();
  const modelUsage = new Map<string, any>();
  const providerUsage = new Map<string, any>();
  const daily = new Map<string, any>();
  for (const u of usages) {
    if (u.feature === 'image_generation' || u.feature?.startsWith('image_')) continue;
    const total = num(u.total_tokens), input = num(u.prompt_tokens), output = num(u.completion_tokens);
    const f = financialMap.get(u.id);
    const user = userUsage.get(u.user_id) || { userId: u.user_id, requests: 0, inputTokens: 0, outputTokens: 0, tokens: 0, credits: 0, estimatedNgn: null, actualNgn: null, lastUsedAt: null };
    user.requests++; user.inputTokens += input; user.outputTokens += output; user.tokens += total; user.credits += num(u.credits_used);
    if (f?.estimated_ngn !== null && f?.estimated_ngn !== undefined) user.estimatedNgn = moneyText(moneyUnits(user.estimatedNgn || '0') + moneyUnits(f.estimated_ngn));
    if (f?.actual_ngn !== null && f?.actual_ngn !== undefined) user.actualNgn = moneyText(moneyUnits(user.actualNgn || '0') + moneyUnits(f.actual_ngn));
    if (!user.lastUsedAt || u.created_at > user.lastUsedAt) user.lastUsedAt = u.created_at;
    userUsage.set(u.user_id, user);

    for (const [map, key] of [[featureUsage, u.feature || 'unknown'], [modelUsage, u.model || 'unknown'], [providerUsage, f?.provider || (u.model?.includes('/') ? u.model.split('/')[0] : 'unknown')]] as const) {
      const v = map.get(key) || { requests: 0, tokens: 0, inputTokens: 0, outputTokens: 0 };
      v.requests++; v.tokens += total; v.inputTokens += input; v.outputTokens += output; map.set(key, v);
    }
    const day = u.created_at.slice(0, 10), v = daily.get(day) || { date: day, requests: 0, tokens: 0 };
    v.requests++; v.tokens += total; daily.set(day, v);
  }
  const allTokens = usages.reduce((n, u) => n + num(u.total_tokens), 0);
  const inputTokens = usages.reduce((n, u) => n + num(u.prompt_tokens), 0);
  const outputTokens = usages.reduce((n, u) => n + num(u.completion_tokens), 0);
  const totalCredits = usages.reduce((n, u) => n + num(u.credits_used), 0);

  const now = new Date();
  const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const startOfWeek = new Date(startOfDay); startOfWeek.setUTCDate(startOfWeek.getUTCDate() - 6);
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const periodStats = (start: Date) => {
    const set = usages.filter(u => new Date(u.created_at) >= start);
    return { requests: set.length, tokens: set.reduce((n, u) => n + num(u.total_tokens), 0), inputTokens: set.reduce((n, u) => n + num(u.prompt_tokens), 0), outputTokens: set.reduce((n, u) => n + num(u.completion_tokens), 0), credits: set.reduce((n, u) => n + num(u.credits_used), 0) };
  };

  const subscriptions = subsQ.data || [];
  const mrr = subscriptions.filter((s: any) => s.status === 'active' && (!s.current_period_end || new Date(s.current_period_end) > now))
    .reduce((sum: bigint, s: any) => {
      const payment = payments.find((p: Payment) => p.reference === s.payment_reference && p.status === 'success' && p.verified_at);
      if (!payment || payment.currency?.toUpperCase() !== 'NGN') return sum;
      const months = payment.billing_period === 'yearly' ? 12 : payment.billing_period === 'quarterly' ? 3 : payment.billing_period === 'monthly' ? 1 : 0;
      if (!months) return sum;
      return sum + paymentNgN(payment) / BigInt(months);
    }, 0n);

  const hosting = hostingQ.data || [];
  const builds = buildsQ.data || [];
  const previews = previewsQ.data || [];
  const runs = runsQ.data || [];
  const toolEvents = toolEventsQ.data || [];
  const expenses = (expensesQ.data || []).filter((e: any) => inRange(e.incurred_at));
  const expenseTotal = sumMoney(expenses.filter((e: any) => e.currency === 'NGN' || e.amount_ngn).map((e: any) => e.amount_ngn ?? (e.currency === 'NGN' ? e.amount : 0)));
  const successfulHostingRenewals = (renewalsQ.data || []).filter((r: any) => r.status === 'succeeded' && inRange(r.paid_at || r.created_at));
  const hostingRevenue = sumMoney(successfulHostingRenewals.filter((r: any) => r.currency === 'NGN').map((r: any) => moneyText(moneyUnits(String(r.amount_kobo)) / 100n)));

  const upcoming7 = hosting.filter((h: any) => h.next_renewal_at && new Date(h.next_renewal_at) >= now && new Date(h.next_renewal_at) <= new Date(now.getTime() + 7 * 86400000));
  const upcoming30 = hosting.filter((h: any) => h.next_renewal_at && new Date(h.next_renewal_at) >= now && new Date(h.next_renewal_at) <= new Date(now.getTime() + 30 * 86400000));
  const statusCounts = (items: any[]) => items.reduce((acc: Record<string, number>, item) => { const key = String(item.status || 'unknown'); acc[key] = (acc[key] || 0) + 1; return acc; }, {});

  return NextResponse.json({
    generatedAt: now.toISOString(),
    range: { from, to },
    limits: { maxRows: MAX, truncated: required.some(q => q.truncated) },
    overview: {
      registeredUsers: users.length,
      successfulPayments: successfulPayments.length,
      activeSubscriptions: subscriptions.filter((s: any) => s.status === 'active' && (!s.current_period_end || new Date(s.current_period_end) > now)).length,
      aiRequests: usages.filter(u => !u.feature?.startsWith('image_')).length,
      inputTokens, outputTokens, totalTokens: allTokens, creditsUsed: totalCredits,
      actualAiSpendNgn: actualCostComplete ? moneyText(actualAiCost) : null, estimatedAiValueNgn: estimatedCostComplete ? moneyText(estimatedAiValue) : null,
      grossRevenueNgn: moneyText(grossRevenue), refundsNgn: moneyText(refundedRevenue), netRevenueNgn: moneyText(netRevenue),
      mrrNgn: moneyText(mrr), hostingRevenueNgn: moneyText(hostingRevenue),
      recordedExpensesNgn: moneyText(expenseTotal),
      netOperatingResultNgn: actualCostComplete ? moneyText(netRevenue - expenseTotal - actualAiCost) : null,
      profitUsesActualCostsOnly: true,
      unpricedAiRequests: eligibleUsages.length - pricedRows,
      today: periodStats(startOfDay), week: periodStats(startOfWeek), month: periodStats(startOfMonth),
    },
    ai: {
      byFeature: [...featureUsage.entries()].map(([name, value]) => ({ name, ...value })).sort((a, b) => b.tokens - a.tokens),
      byModel: [...modelUsage.entries()].map(([name, value]) => ({ name, ...value })).sort((a, b) => b.tokens - a.tokens),
      byProvider: [...providerUsage.entries()].map(([name, value]) => ({ name, ...value })).sort((a, b) => b.tokens - a.tokens),
      daily: [...daily.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-60),
      averageTokensPerRequest: (() => { const eligible = usages.filter(u => !u.feature?.startsWith('image_')); return eligible.length ? Math.round(allTokens / eligible.length) : 0; })(),
      users: [...userUsage.values()].map((u: any) => ({ ...u, ...(profileMap.get(u.userId) ? { name: profileMap.get(u.userId).full_name, email: profileMap.get(u.userId).email } : {}) })).sort((a: any, b: any) => b.tokens - a.tokens),
      imageGenerationRequests: usages.filter(u => u.feature === 'image_generation' || u.feature?.startsWith('image_')).length,
    },
    revenue: {
      paymentStatuses: statusCounts(payments),
      payments: payments.slice(0, 250),
      subscriptions: subscriptions.map((s: any) => ({ ...s, payment: payments.find((p: Payment) => p.reference === s.payment_reference) || null })),
      subscriptionStatuses: statusCounts(subscriptions),
      recurringRevenueNgn: moneyText(mrr),
      successfulRevenueNgn: moneyText(grossRevenue),
      netRevenueNgn: moneyText(netRevenue),
      currencies: [...new Set(payments.map((p: Payment) => p.currency || 'unknown'))],
    },
    hosting: {
      records: hosting,
      statusCounts: statusCounts(hosting),
      expiringWithin7Days: upcoming7.length,
      expiringWithin30Days: upcoming30.length,
      expired: hosting.filter((h: any) => h.ends_at && new Date(h.ends_at) < now).length,
      paid: hosting.filter((h: any) => h.status === 'active' || h.status === 'paid').length,
      trials: hosting.filter((h: any) => h.status === 'trial').length,
      revenueNgn: moneyText(hostingRevenue),
    },
    bram: {
      runs: runs.slice(0, 500).map((r: any) => ({ ...r, durationMs: r.started_at && r.completed_at ? Math.max(0, new Date(r.completed_at).getTime() - new Date(r.started_at).getTime()) : null })),
      runStatuses: statusCounts(runs),
      tools: toolEvents.slice(0, 1000),
      toolCounts: statusCounts(toolEvents),
      workflows: workflowQ.data || [],
      averageDurationMs: (() => { const done = runs.filter((r: any) => r.started_at && r.completed_at); return done.length ? Math.round(done.reduce((n: number, r: any) => n + new Date(r.completed_at).getTime() - new Date(r.started_at).getTime(), 0) / done.length) : null; })(),
      successRate: runs.length ? Math.round(runs.filter((r: any) => r.status === 'completed' || r.status === 'succeeded').length / runs.length * 10000) / 100 : null,
    },
    websites: {
      builds: builds.slice(0, 500),
      buildStatuses: statusCounts(builds),
      previews: previews.slice(0, 500),
      previewStatuses: statusCounts(previews),
      successfulBuilds: builds.filter((b: any) => ['deployed','success','succeeded','completed'].includes(b.status)).length,
      failedBuilds: builds.filter((b: any) => b.status === 'failed' || b.status === 'error').length,
    },
    expenses: { items: expenses, totalNgn: moneyText(expenseTotal), byCategory: Object.entries(expenses.reduce((acc: Record<string, bigint>, e: any) => { const v = e.amount_ngn ?? (e.currency === 'NGN' ? e.amount : '0'); acc[e.category] = (acc[e.category] || 0n) + moneyUnits(v); return acc; }, {})).map(([category, amount]) => ({ category, amountNgn: moneyText(amount) })) },
    financialCoverage: { usageRows: usages.length, costRows: financials.length, pricedRows, actualCostRows: actualCostRows.length, actualCostComplete, estimatedCostComplete },
    diagnostics: { dataSources: required.map((q, i) => ({ name: ['profiles','ai_usage','payments','subscriptions','hosting_subscriptions','project_builds','cloudflare_preview_jobs','agent_runs','bram_tool_events','business_expenses','ai_usage_financials','hosting_renewal_payments','engineering_workflows'][i], rows: q.data.length, truncated: q.truncated })), unknownStatuses: true },
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}
