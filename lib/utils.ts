import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }
export function getSessionId() { if (typeof window === 'undefined') return ''; const key='leo_session_id'; let id=localStorage.getItem(key); if(!id){id=crypto.randomUUID();localStorage.setItem(key,id);} return id; }
export function envEnabled(key: string) { return Boolean(process.env[key]); }
