import { wywolajAI } from "../src/ai.js";

let bledy = 0;
function sprawdz(nazwa, wynik, oczekiwane) {
  const a = JSON.stringify(wynik), b = JSON.stringify(oczekiwane);
  if (a !== b) { console.log(`✗ ${nazwa}\n   otrzymano: ${a}\n   oczekiwano: ${b}`); bledy++; }
  else console.log(`✓ ${nazwa}`);
}

const env = { ANTHROPIC_API_KEY: "sk-ant-test" };
let wyslane = [];

function udawajFetch(odpowiedzi) {
  wyslane = [];
  let i = 0;
  globalThis.fetch = async (url, opcje) => {
    wyslane.push(JSON.parse(opcje.body));
    const o = odpowiedzi[i++];
    return { ok: o.status === 200, status: o.status, text: async () => o.body };
  };
}

const sukces = JSON.stringify({ content: [{ type: "text", text: "ok" }], stop_reason: "end_turn" });

// 1. Odrzucenie parametrów rozszerzonych ma skutkować ponowieniem bez nich
udawajFetch([
  { status: 400, body: "" },
  { status: 200, body: sukces },
]);
let wynik = await wywolajAI(env, [{ role: "user", content: "hi" }], { system: "S", effort: "high" });
sprawdz("400 na parametrach → ponowienie kończy się sukcesem", wynik, "ok");
sprawdz("wysłano dokładnie dwa zapytania", wyslane.length, 2);
sprawdz("pierwsze miało thinking", !!wyslane[0].thinking, true);
sprawdz("pierwsze miało output_config", !!wyslane[0].output_config, true);
sprawdz("ponowione NIE ma thinking", wyslane[1].thinking, undefined);
sprawdz("ponowione NIE ma output_config", wyslane[1].output_config, undefined);
sprawdz("ponowione zachowuje system", wyslane[1].system, "S");
sprawdz("ponowione zachowuje wiadomości", wyslane[1].messages, [{ role: "user", content: "hi" }]);

// 2. Gdy ponowienie też padnie, użytkownik dostaje treść błędu, nie puste "(400)"
udawajFetch([
  { status: 400, body: "" },
  { status: 400, body: JSON.stringify({ error: { message: "coś konkretnego" } }) },
]);
try {
  await wywolajAI(env, [{ role: "user", content: "hi" }], {});
  sprawdz("drugie 400 rzuca błąd", "nie rzucono", "rzucono");
} catch (e) {
  sprawdz("drugie 400 niesie treść od API", /coś konkretnego/.test(e.message), true);
}

// 3. Brak środków ma własny komunikat
udawajFetch([
  { status: 400, body: JSON.stringify({ error: { message: "Your credit balance is too low" } }) },
  { status: 400, body: JSON.stringify({ error: { message: "Your credit balance is too low" } }) },
]);
try {
  await wywolajAI(env, [{ role: "user", content: "hi" }], {});
} catch (e) {
  sprawdz("brak środków tłumaczy się po polsku", /nie ma środków/.test(e.message), true);
}

// 4. Sukces za pierwszym razem nie ponawia niczego
udawajFetch([{ status: 200, body: sukces }]);
await wywolajAI(env, [{ role: "user", content: "hi" }], {});
sprawdz("sukces = jedno zapytanie", wyslane.length, 1);

console.log(bledy ? `\n${bledy} błędów` : "\nWszystkie testy przeszły");
process.exit(bledy ? 1 : 0);
