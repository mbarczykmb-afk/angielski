/* ============================================================
   Service worker — instalacja na ekranie głównym i praca bez sieci
   Podnieś WERSJA po każdej zmianie plików, żeby telefon pobrał nowe.
   ============================================================ */

var WERSJA = "angielski-ai-v25";

var SZKIELET = [
  "./",
  "./index.html",
  "./app.css",
  "./manifest.webmanifest",
  "./icons/ikona-192.png",
  "./icons/ikona-512.png",
  "./icons/ikona.svg",
  "./js/rdzen.js",
  "./js/api.js",
  "./js/mowa.js",
  "./js/logowanie.js",
  "./js/test.js",
  "./js/dzis.js",
  "./js/rozmowa.js",
  "./js/robot3d.js",
  "./js/android3d.js",
  "./js/vendor/twarz-mediapipe.js",
  "./js/vendor/RoomEnvironment.js",
  "./js/vendor/three.module.min.js",
  "./js/awatar.js",
  "./js/matura.js",
  "./js/slowa.js",
  "./js/postep.js",
  "./js/ustawienia.js",
  "./js/app.js",
];

self.addEventListener("install", function (zdarzenie) {
  zdarzenie.waitUntil(
    caches.open(WERSJA).then(function (magazyn) {
      // cache: "reload" — z pominięciem pamięci przeglądarki. GitHub Pages pozwala
      // trzymać pliki do 10 minut, więc bez tego nowa wersja potrafiła
      // zainstalować się ze STARYMI plikami i poprawka nie docierała do telefonu.
      return magazyn.addAll(SZKIELET.map(function (u) { return new Request(u, { cache: "reload" }); }));
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

// Najpierw sieć, pamięć tylko awaryjnie. Wcześniej było odwrotnie (najpierw
// pamięć, odświeżenie w tle) i telefon potrafił długo uruchamiać starą wersję —
// poprawki nie docierały, choć były już opublikowane. Sieć ma 4 sekundy;
// potem, albo bez internetu, aplikacja startuje z zapamiętanych plików.
function zSieci(adres) {
  return new Promise(function (ok, blad) {
    var czas = setTimeout(function () { blad(new Error("timeout")); }, 4000);
    fetch(new Request(adres, { cache: "no-cache", credentials: "same-origin" })).then(function (odp) {
      clearTimeout(czas);
      ok(odp);
    }, function (e) {
      clearTimeout(czas);
      blad(e);
    });
  });
}

self.addEventListener("fetch", function (zdarzenie) {
  var zadanie = zdarzenie.request;

  if (zadanie.method !== "GET") return;

  // Zapytania do API zawsze idą do sieci — cache postępów byłby mylący
  if (zadanie.url.indexOf("/api/") > -1) return;
  // Obce adresy (np. zdjęcia do matury) — bez pośrednictwa
  if (new URL(zadanie.url).origin !== self.location.origin) return;

  zdarzenie.respondWith(
    zSieci(zadanie.url).then(function (odp) {
      if (odp && odp.status === 200 && odp.type === "basic") {
        var kopia = odp.clone();
        caches.open(WERSJA).then(function (magazyn) { magazyn.put(zadanie, kopia); });
      }
      return odp;
    }).catch(function () {
      return caches.match(zadanie).then(function (zCache) {
        return zCache || (zadanie.mode === "navigate" ? caches.match("./index.html") : Response.error());
      });
    })
  );
});
