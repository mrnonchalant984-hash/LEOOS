"use client";
import { usePathname } from "next/navigation";
import { LEOWidget } from "./LEOWidget";
export function GlobalLEOWidget(){ const pathname=usePathname(); if(['/app','/auth','/admin','/dashboard','/projects','/agents','/deployments','/analytics','/api-keys','/audit','/account','/developers','/docs','/integrations','/leo-ai','/notifications','/observability','/organizations','/resources','/setup','/support','/status','/team','/templates','/tutorials','/webhooks','/whats-new'].some(prefix => pathname === prefix || pathname?.startsWith(prefix + '/'))) return null; return <LEOWidget/>; }
