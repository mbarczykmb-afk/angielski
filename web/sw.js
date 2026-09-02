/* ============================================================
   Service worker — instalacja na ekranie głównym i praca bez sieci
   Podnieś WERSJA po każdej zmianie plików, żeby telefon pobrał nowe.
   ============================================================ */

var WERSJA = "angielski-ai-v5";

var SZKIELET = [
  "./",
  "./index.html",
  "./app.css",
  "./manifest.webmanifest",
  "./icons/ikona-192.png",
  "./icons/ikona-512.png",
  "./js/rdzen.js",
  "./js/api.js",
  "./js/mowa.js",
  "./js/logowanie.js",
  "./js/test.js",
  "./js/dzis.js",
  "./js/rozmowa.js",
  "./js/slowa.js",
  "./js/postep.js",
  "./js/ustawienia.js",
  "./js/app.js",
];

self.addEventListener("install", function (zdarzenie) {
  zdarzenie.waitUntil(
    caches.open(WERSJA).then(function (magazyn) {
      return magazyn.addAll(SZKIELET);
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener("activate", function (zdarzenie) {
  zdarzenie.waitUntil(
    caches.keys().then(function (klucze) {
      return Promise.all(
        klucze.filter(function (k) { return k !== WERSJA; })
              .map(function (k) { return caches.delete(k); })
      );
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener("fetch", function (zdarzenie) {
  var zadanie = zdarzenie.request;

  if (zadanie.method !== "GET") return;

  // Zapytania do API zawsze idą do sieci — cache postępów byłby mylący
  if (zadanie.url.indexOf("/api/") > -1) return;

  // Szkielet aplikacji: najpierw cache (szybki start), w tle odświeżenie
  zdarzenie.respondWith(
    caches.match(zadanie).then(function (zCache) {
      var zSieci = fetch(zadanie).then(function (odp) {
        if (odp && odp.status === 200 && odp.type === "basic") {
          var kopia = odp.clone();
          caches.open(WERSJA).then(function (magazyn) { magazyn.put(zadanie, kopia); });
        }
        return odp;
      }).catch(function () {
        return zCache;
      });

      return zCache || zSieci;
    })
  );
});
