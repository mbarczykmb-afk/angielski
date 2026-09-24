// Gemini: ponowienia, zapasowe modele, przejście na Claude i test z Ustawień.
// Zgłoszenie z użycia: "Gemini chwilowo niedostępne" przy każdej turze rozmowy.
import { wywolajGemini, testGemini } from "../src/gemini.js";
import { wywolajAI, DOSTAWCA_GEMINI } from "../src/ai.js";

let bledy = 0;
function sprawdz(nazwa, wynik, oczekiwane) {
  const a = JSON.stringify(wynik), b = JSON.stringify(oczekiwane);
  if (a !== b) { console.log(`✗ ${nazwa}\n   otrzymano: ${a}\n   oczekiwano: ${b}`); bledy++; }
  else console.log(`✓ ${nazwa}`);
}

const env = { GEMINI_API_KEY: "g-test", ANTHROPIC_API_KEY: "sk-ant-test", GEMINI_MODEL: "gemini-3.7-flash" };
let adresy = [];
function udawaj(odpowiedzi) {
  adresy = [];
  let i = 0;
  globalThis.fetch = async (url) => {
    adresy.push(String(url).includes("anthropic") ? "claude" : String(url).match(/models\/([^:]+):/)[1]);
    const o = odpowiedzi[Math.min(i++, odpowiedzi.length - 1)];
    return { ok: o.status === 200, status: o.status, text: async () => o.body };
  };
}
const gOk = (t) => ({ status: 200, body: JSON.stringify({ candidates: [{ content: { parts: [{ text: t }] }, finishReason: "STOP" }] }) });
const gBlad = (st, m) => ({ status: st, body: JSON.stringify({ error: { message: m } }) });
const cOk = { status: 200, body: JSON.stringify({ content: [{ type: "text", text: "z Claude" }], stop_reason: "end_turn" }) };
const w = [{ role: "user", content: "hi" }];

udawaj([gBlad(503, "The model is overloaded."), gBlad(503, "The model is overloaded."), gOk("hello")]);
sprawdz("503 dwa razy → zapasowy model odpowiada", await wywolajGemini(env, w), "hello");
sprawdz("kolejność: ponowienie, potem gemini-flash-latest", adresy, ["gemini-3.7-flash", "gemini-3.7-flash", "gemini-flash-latest"]);

udawaj([gBlad(404, "models/gemini-3.7-flash is not found"), gOk("hi there")]);
sprawdz("404 → od razu następny model", await wywolajGemini(env, w), "hi there");
sprawdz("bez ponawiania nieistniejącego modelu", adresy, ["gemini-3.7-flash", "gemini-flash-latest"]);

udawaj([gBlad(400, "API key not valid. Please pass a valid API key.")]);
let blad = null;
try { await wywolajGemini(env, w); } catch (e) { blad = e.message; }
sprawdz("zły klucz → jedna próba i jasny komunikat", [adresy.length, blad], [1, "Nieprawidłowy klucz Gemini. Ustaw go ponownie w Workerze."]);

udawaj([gBlad(503, "overloaded"), gBlad(503, "overloaded"), gBlad(503, "overloaded"), gBlad(503, "overloaded"), gBlad(503, "overloaded"), gBlad(503, "overloaded"), cOk]);
sprawdz("wszystkie modele Gemini padły → turę obsługuje Claude",
  await wywolajAI(env, w, { dostawca: DOSTAWCA_GEMINI, system: "S" }), "z Claude");
sprawdz("ostatnie zapytanie poszło do Claude", adresy[adresy.length - 1], "claude");

udawaj([gBlad(404, "not found"), gOk("OK")]);
const t = await testGemini(env);
sprawdz("test z Ustawień: działa i mówi który model", [t.ok, t.model], [true, "gemini-flash-latest"]);
sprawdz("test z Ustawień: przebieg prób z komunikatem Google", t.proby[0], { model: "gemini-3.7-flash", ok: false, status: 404, komunikat: "not found" });

udawaj([gBlad(403, "Generative Language API has not been used in project")]);
const t2 = await testGemini(env);
sprawdz("test z Ustawień: błąd z treścią od Google", [t2.ok, /has not been used/.test(t2.blad)], [false, true]);

console.log(bledy ? `\n${bledy} błędów` : "\nWszystkie testy przeszły");
process.exit(bledy ? 1 : 0);
