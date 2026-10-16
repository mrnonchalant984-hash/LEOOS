import { ShieldCheck, RotateCcw } from 'lucide-react';
import { LEOAppShell } from '@/components/LEOAppShell';
import { WebhooksPanel } from '@/components/WebhooksPanel';

export default function Webhooks(){return <LEOAppShell title="Webhooks" subtitle="Signed event delivery for applications built on LEO OS."><div className="page-hero"><span className="mini-label">Event delivery · project and API events</span><h2>Connect LEO OS events to your systems.</h2><p>Configure HTTPS endpoints, subscribe to project and API events, copy the signing secret once, inspect deliveries, and retry failures. Delivery retries are stored with backoff, but the current scheduled worker runs daily; retry timing is therefore not near-real-time.</p><div className="hero-actions"><span className="secondary-button"><ShieldCheck size={13}/> HMAC signatures</span><span className="secondary-button"><RotateCcw size={13}/> Bounded retries · daily worker</span></div></div><WebhooksPanel /></LEOAppShell>}
