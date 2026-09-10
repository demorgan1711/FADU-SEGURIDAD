/* ======================================================================================= */
/* OJO: esta configuración tiene que ser EXACTAMENTE la misma que la de firebaseConfig       */
/* dentro de index.html — los dos archivos tienen que apuntar al mismo proyecto de Firebase. */
/* Si estás probando en el proyecto de test, pegá acá la config del proyecto de TEST,        */
/* la misma que hayas puesto en el index.html de esa copia.                                  */
/* ======================================================================================= */
importScripts('https://www.gstatic.com/firebasejs/10.13.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.13.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyApTkrL46F0XhmMbZ6dEXYOVzcBca-iCaM",
  authDomain: "fadu-seguridad.firebaseapp.com",
  projectId: "fadu-seguridad",
  storageBucket: "fadu-seguridad.firebasestorage.app",
  messagingSenderId: "440485002142",
  appId: "1:440485002142:web:ad0a9dd7dc06742804348f"
});

const messaging = firebase.messaging();

// esto se dispara cuando llega un push y la app está cerrada o en otra pestaña
messaging.onBackgroundMessage((payload) => {
  const title = (payload.notification && payload.notification.title) || "Control Seguridad FADU";
  const body = (payload.notification && payload.notification.body) || "";
  self.registration.showNotification(title, {
    body,
    icon: "icons/icon-192.png",
    badge: "icons/icon-192.png",
    vibrate: [150, 80, 150, 80, 150],
  });
});

// al tocar la notificación, la cierra y abre la app (o la enfoca, si ya está abierta en otra pestaña)
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) { if ("focus" in client) return client.focus(); }
      if (self.clients.openWindow) return self.clients.openWindow("./");
    })
  );
});

/* ======================================================================================= */
/* De acá para abajo: lo que antes era el archivo sw.js aparte (cacheo para que la app       */
/* funcione como PWA instalable). Se unificó todo en este único service worker porque tener  */
/* dos archivos de service worker registrados a la vez en la misma dirección hacía que el     */
/* celular solo dejara uno activo, y a veces el push le llegaba al que no sabía qué hacer     */
/* con eso — se perdía en silencio. Ahora hay uno solo que hace las dos cosas.                */
/* ======================================================================================= */
const CACHE = "llaves-cache-v1";
const SHELL = ["./", "./index.html", "./manifest.json", "./icons/icon-192.png", "./icons/icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  // network-first para que los cambios de la app lleguen siempre que haya señal
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});
