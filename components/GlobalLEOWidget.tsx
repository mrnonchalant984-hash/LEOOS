"use client";
import { usePathname } from "next/navigation";
import { LEOWidget } from "./LEOWidget";
export function GlobalLEOWidget(){ const pathname=usePathname(); if(pathname==="/app"||pathname?.startsWith('/auth')||pathname?.startsWith('/admin')) return null; return <LEOWidget/>; }
