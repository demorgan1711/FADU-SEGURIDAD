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
/* De acá para abajo: cacheo para que la app funcione como PWA instalable.                   */
/* Se unificó en este único service worker (ver nota histórica en el repo): un solo archivo  */
/* hace las dos cosas, push y caché.                                                         */
/*                                                                                           */
/* CAMBIO (v1.17.9): antes la copia guardada de la app se hacía UNA SOLA VEZ, al instalar el */
/* service worker, y nunca se refrescaba. Si fallaba internet, el celular abría esa copia    */
/* congelada (la 1.15.x). Ahora:                                                             */
/*  - cada vez que la red responde bien, se guarda la copia nueva (siempre queda la última   */
/*    versión buena);                                                                        */
/*  - la red tiene prioridad, pero si tarda más de 6 s o falla, se abre la última copia      */
/*    buena y la actualización sigue en segundo plano;                                       */
/*  - se pide siempre revalidando con el servidor (GitHub Pages cachea 10 min por su cuenta).*/
/* ======================================================================================= */
const CACHE = "fadu-cache-v2"; // si algún día hace falta tirar todas las copias guardadas, subir este número
const SCOPE = self.registration.scope;
const INDEX_URL = new URL("./index.html", SCOPE).href;
const SHELL = ["./index.html", "./manifest.json", "./icons/icon-192.png", "./icons/icon-512.png"];
const NET_TIMEOUT = 6000; // ms que se espera a la red antes de abrir la copia guardada

self.addEventListener("install", (e) => {
  // se descarga cada archivo por separado y salteando la caché del navegador; si alguno falla
  // (ej. un ícono que no existe) NO se cancela la instalación, así el service worker siempre se actualiza.
  e.waitUntil(
    caches.open(CACHE).then((c) =>
      Promise.all(
        SHELL.map((u) =>
          fetch(new Request(u, { cache: "reload" }))
            .then((r) => (r.ok ? c.put(new URL(u, SCOPE).href, r) : null))
            .catch(() => null)
        )
      )
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  // borra solo las copias viejas de ESTA app (github.io se comparte con otros proyectos)
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => (k.startsWith("llaves-cache") || k.startsWith("fadu-cache")) && k !== CACHE)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Firebase, Google Fonts, etc.: los maneja el navegador
  const isPage = req.mode === "navigate" || url.href === SCOPE || url.origin + url.pathname === INDEX_URL;
  // la página se pide con un ?v=hora para saltear cachés intermedios (CDN, red del celular) que a veces devuelven una copia vieja
  e.respondWith(networkFirst(e, isPage ? INDEX_URL + "?v=" + Date.now() : req, isPage ? INDEX_URL : req.url, isPage));
});

function networkFirst(e, toFetch, key, isPage) {
  const fresh = fetch(toFetch, { cache: isPage ? "no-store" : "no-cache" }).then((res) => {
    if (res && res.ok) {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(key, copy)).catch(() => {});
    }
    return res;
  });
  e.waitUntil(fresh.catch(() => {})); // la descarga sigue y actualiza la copia aunque se haya abierto la guardada
  const guarded = isPage
    ? Promise.race([fresh, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), NET_TIMEOUT))])
    : fresh;
  return guarded
    .then((res) => (res && res.ok ? res : fromCache(key, res)))
    .catch(() => fromCache(key));
}

function fromCache(key, res) {
  return caches.match(key).then((hit) => hit || res || Response.error());
}
