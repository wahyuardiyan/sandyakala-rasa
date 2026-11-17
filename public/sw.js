// Service worker: menampilkan notifikasi browser saat tab Sandyakala Rasa tertutup.
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });

self.addEventListener('push', function (e) {
  var d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { title: 'Sandyakala Rasa', body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Sandyakala Rasa', {
    body: d.body || '',
    icon: '/img/logo-mark.png',
    badge: '/img/favicon.png',
    data: { url: d.url || '/notifikasi' },
    tag: d.url || 'sr',
    renotify: true,
    vibrate: [180, 80, 180],
  }));
});

self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var url = (e.notification.data && e.notification.data.url) || '/notifikasi';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
    for (var i = 0; i < list.length; i++) {
      if ('focus' in list[i]) { list[i].navigate(url); return list[i].focus(); }
    }
    return self.clients.openWindow(url);
  }));
});
