'use client';
import * as React from 'react'; import {cn} from '@/lib/utils';
export function Button({className,variant='default',...props}:React.ButtonHTMLAttributes<HTMLButtonElement>&{variant?:'default'|'outline'|'ghost'}){return <button className={cn('inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold transition disabled:opacity-50',variant==='default'?'bg-[var(--gold)] text-black hover:brightness-90':variant==='outline'?'border border-zinc-700 bg-transparent hover:border-[var(--gold)]':'hover:bg-zinc-900',className)} {...props}/>}
