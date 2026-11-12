self.addEventListener('push', event => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch { payload = { body: event.data?.text() ?? '' }; }
  const title = typeof payload.title === 'string' ? payload.title : 'LeoX Store';
  const options = {
    body: typeof payload.body === 'string' ? payload.body : '',
    data: { href: typeof payload.href === 'string' && payload.href.startsWith('/store/') ? payload.href : '/store/account' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const href = event.notification.data?.href;
  if (!href || !href.startsWith('/store/')) return;
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
    for (const client of windowClients) {
      if (new URL(client.url).origin === self.location.origin) {
        client.navigate(new URL(href, self.location.origin).toString());
        return client.focus();
      }
    }
    return clients.openWindow(new URL(href, self.location.origin).toString());
  }));
});
