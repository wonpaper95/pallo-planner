// 앱처럼 설치 + 데드라인 푸시 알람. 화면 파일은 네트워크 우선(배포하면 바로 반영), 끊기면 캐시.
const CACHE = "planner-v3";
const SHELL = ["./", "index.html", "week.js", "pick.js", "sales.js", "blog.js", "blog.css", "config.js", "manifest.webmanifest", "icon-192.png"];

self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL))); self.skipWaiting(); });
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return; // supabase 요청은 건드리지 않음
  e.respondWith(fetch(e.request.url, { cache: "no-cache", credentials: "same-origin" }).then((r) => { // 브라우저 10분 캐시 무시하고 서버에 확인 → 배포하면 바로 새 화면
    const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return r;
  }).catch(() => caches.match(e.request)));
});

self.addEventListener("push", (e) => {
  const m = e.data ? e.data.json() : { title: "팔로 플래너", body: "" };
  e.waitUntil(self.registration.showNotification(m.title, {
    body: m.body, tag: m.tag, icon: "icon-192.png", badge: "icon-192.png", requireInteraction: true, renotify: true,
  }));
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((ws) =>
    ws.length ? ws[0].focus() : self.clients.openWindow("./")));
});
