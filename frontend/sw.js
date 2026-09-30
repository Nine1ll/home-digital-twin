// 푸시 알림만 처리한다. 데이터가 모두 서버에 있어 오프라인 캐시는 하지 않는다.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("push", (e) => {
  const d = e.data ? e.data.json() : {};
  e.waitUntil(
    self.registration.showNotification(d.title || "우리집", {
      body: d.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: "twin-daily", // 같은 날 여러 번 와도 하나만 남긴다
      data: { view: d.view || "alerts" },
    }),
  );
});
// 알림을 누르면 열린 앱을 앞으로 가져와 해당 화면으로, 없으면 새로 연다
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const view = e.notification.data?.view || "alerts";
  e.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windows) => {
        if (!windows.length) return self.clients.openWindow("/#" + view);
        windows[0].postMessage({ view });
        return windows[0].focus();
      }),
  );
});
