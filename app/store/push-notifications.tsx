'use client';

import { useEffect, useState } from 'react';

function decodeApplicationServerKey(value: string) {
  const padded = value + '='.repeat((4 - value.length % 4) % 4);
  const decoded = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(decoded, char => char.charCodeAt(0));
}

export function StorePushNotifications() {
  const [enabled, setEnabled] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    fetch('/api/store/push', { cache: 'no-store' }).then(async response => {
      const config = await response.json().catch(() => ({}));
      if (!active || !config.enabled || !('serviceWorker' in navigator) || !('PushManager' in window)) return;
      setEnabled(true);
      const registration = await navigator.serviceWorker.getRegistration('/store/');
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) setSubscribed(true);
    }).catch(() => { if (active) setMessage('Push notification settings are temporarily unavailable.'); });
    return () => { active = false; };
  }, []);

  async function toggle() {
    setBusy(true); setMessage('');
    try {
      const registration = await navigator.serviceWorker.register('/store-push-sw.js', { scope: '/store/' });
      if (subscribed) {
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) {
          const response = await fetch('/api/store/push', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: subscription.endpoint }) });
          if (!response.ok) throw new Error('Push subscription could not be removed.');
          await subscription.unsubscribe();
        }
        setSubscribed(false); setMessage('Push notifications disabled.');
      } else {
        if (!('Notification' in window)) throw new Error('This browser does not support push notifications.');
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') throw new Error('Allow notifications in your browser settings to enable push alerts.');
        const configResponse = await fetch('/api/store/push', { cache: 'no-store' });
        const config = await configResponse.json().catch(() => ({}));
        if (!configResponse.ok || typeof config.publicKey !== 'string') throw new Error('Push notification configuration is unavailable.');
        const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: decodeApplicationServerKey(config.publicKey) });
        const response = await fetch('/api/store/push', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(subscription.toJSON()) });
        if (!response.ok) { await subscription.unsubscribe(); throw new Error('Push subscription could not be saved.'); }
        setSubscribed(true); setMessage('Push notifications enabled on this device.');
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Push notifications could not be updated.');
    } finally { setBusy(false); }
  }

  if (!enabled) return null;
  return <section className="mt-6 rounded-xl border border-white/10 p-4">
    <h2 className="font-semibold">Store push notifications</h2>
    <p className="mt-1 text-sm text-white/55">Get order and message alerts on this device. You can turn them off at any time.</p>
    <button type="button" disabled={busy} onClick={() => void toggle()} className="mt-3 rounded-lg border border-white/15 px-3 py-2 text-sm disabled:opacity-60">{busy ? 'Updating…' : subscribed ? 'Disable push alerts' : 'Enable push alerts'}</button>
    {message && <p role="status" className="mt-2 text-xs text-white/65">{message}</p>}
  </section>;
}
