/* ============================================================
   Ekran logowania — adres serwera, profile, PIN, rejestracja
   ============================================================ */

var Logowanie = {
  wybranyProfil: null,
  wymaganyKod: false,
};

function pokazBlok(nazwa) {
  ["adres", "profile", "pin", "rejestracja"].forEach(function (b) {
    document.getElementById("blok-" + b).hidden = b !== nazwa;
  });
}

async function startLogowania() {
  pokazEkran("logowanie");

  if (!Api.adres) {
    pokazBlok("adres");
    return;
  }

  spinner(true, "Łączę z serwerem...");
  try {
    var zdrowie = await Api.wywolaj("/api/health");
    Logowanie.wymaganyKod = !!zdrowie.kodRejestracjiWymagany;
    document.getElementById("blok-kod").hidden = !Logowanie.wymaganyKod;

    if (!zdrowie.klucz) {
      toast("Worker działa, ale nie ma klucza API modelu.", false);
    }

    var odp = await Api.wywolaj("/api/auth/profile");
    rysujProfile(odp.profile || []);
  } catch (e) {
    pokazBlok("adres");
    document.getElementById("pole-adres").value = Api.adres;
    toast(e.message, false);
  } finally {
    spinner(false);
  }
}

function rysujProfile(profile) {
  var lista = document.getElementById("lista-profili");

  if (!profile.length) {
    lista.innerHTML = '<p class="podpis">Nie ma jeszcze żadnego profilu. Załóż pierwszy.</p>';
    pokazBlok("rejestracja");
    return;
  }

  lista.innerHTML = profile.map(function (p) {
    return '<div class="pozycja" data-id="' + esc(p.id) + '" style="cursor:pointer">' +
      '<div class="tresc"><b>' + esc(p.nazwa) + '</b>' +
      '<small>' + (p.poziom ? esc(p.poziom) + " · " : "") + p.xp + " XP · 🔥 " + p.streak + "</small></div>" +
      '<span class="znacznik">' + (p.maPin ? "🔒" : "›") + "</span></div>";
  }).join("");

  lista.querySelectorAll(".pozycja").forEach(function (el) {
    el.onclick = function () {
      var profil = profile.find(function (p) { return p.id === el.dataset.id; });
      wybierzProfil(profil);
    };
  });

  pokazBlok("profile");
}

async function wybierzProfil(profil) {
  Logowanie.wybranyProfil = profil;

  if (!profil.maPin) {
    await zalogujProfil(profil.id, "");
    return;
  }

  document.getElementById("pin-naglowek").textContent = profil.nazwa;
  document.getElementById("pole-pin").value = "";
  pokazBlok("pin");
  setTimeout(function () { document.getElementById("pole-pin").focus(); }, 100);
}

async function zalogujProfil(userId, pin) {
  spinner(true, "Loguję...");
  try {
    var odp = await Api.wyslij("/api/auth/logowanie", { userId: userId, pin: pin });
    Api.zapiszToken(odp.token);
    await wczytajStanIPokaz();
  } catch (e) {
    toast(e.message, false);
  } finally {
    spinner(false);
  }
}

/* --- Podpięcie zdarzeń --- */

function podepnijLogowanie() {
  document.getElementById("btn-zapisz-adres").onclick = function () {
    var adres = document.getElementById("pole-adres").value.trim();
    if (!/^https?:\/\/.+/.test(adres)) {
      toast("Adres musi zaczynać się od https://", false);
      return;
    }
    Api.zapiszAdres(adres);
    startLogowania();
  };

  document.getElementById("link-zmien-adres").onclick = function (e) {
    e.preventDefault();
    document.getElementById("pole-adres").value = Api.adres;
    pokazBlok("adres");
  };

  document.getElementById("btn-pokaz-rejestracje").onclick = function () {
    pokazBlok("rejestracja");
  };

  document.getElementById("btn-anuluj-rejestracje").onclick = startLogowania;
  document.getElementById("btn-anuluj-pin").onclick = startLogowania;

  document.getElementById("btn-zaloguj").onclick = function () {
    zalogujProfil(Logowanie.wybranyProfil.id, document.getElementById("pole-pin").value);
  };

  document.getElementById("pole-pin").onkeydown = function (e) {
    if (e.key === "Enter") document.getElementById("btn-zaloguj").click();
  };

  document.getElementById("btn-zarejestruj").onclick = async function () {
    var imie = document.getElementById("pole-imie").value.trim();
    var pin = document.getElementById("pole-nowy-pin").value.trim();

    if (imie.length < 2) {
      toast("Podaj imię (min. 2 znaki).", false);
      return;
    }
    if (pin && !/^\d{4,8}$/.test(pin)) {
      toast("PIN musi mieć od 4 do 8 cyfr.", false);
      return;
    }

    spinner(true, "Zakładam profil...");
    try {
      var odp = await Api.wyslij("/api/auth/rejestracja", {
        nazwa: imie,
        pin: pin,
        celDzienny: Number(document.getElementById("pole-cel").value),
        kod: document.getElementById("pole-kod").value,
      });
      Api.zapiszToken(odp.token);
      await wczytajStanIPokaz();
    } catch (e) {
      toast(e.message, false);
    } finally {
      spinner(false);
    }
  };
}
