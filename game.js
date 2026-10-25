/* ============================================================
   ZUCKERZAUBER · game.js – Levelkarte, Spielbrett, Animation
   ------------------------------------------------------------
   So funktioniert dieses Spiel
   1. Die Regeln stehen in engine.js (ohne DOM, auch in Node testbar).
      Ein Zug liefert eine Liste von PHASEN (tauschen, weg, fallen …),
      jede mit einer Momentaufnahme des Bretts danach.
   2. Diese Datei spielt die Phasen nacheinander als Animation ab: Sie
      hält ein "Anzeige-Brett" (D) und pro Zelle einen Versatz, der in
      jedem Bild Richtung 0 läuft – so rutschen Bonbons sichtbar nach.
   3. Gezeichnet wird auf ein <canvas>; die Bildchen kommen aus
      bonbons.js (einmal gemalt, dann nur noch kopiert).
   4. Die 150 Level (levels.js) hat ein Generator erzeugt: Ein Bot hat
      jedes Level hunderte Male gespielt, daraus folgen Zugzahl und die
      Punkte für zwei und drei Sterne.
   5. Speicher: Bestpunkte und Sterne je Level (ba:zuckerzauber:best).
      Ein Level ist frei, wenn das vorige geschafft ist. Topliste =
      Summe der Bestpunkte über alle Level.
   ============================================================ */

import { lade, speichere, spielZuruecksetzen } from "./assets/storage.js";
import { toplisteAnzeigen, stillEintragen, bewegungReduziert } from "./assets/ui.js";
import { istTonAn, tonKnopf } from "./assets/klang.js";
import { levelGeschafft, dialogKasten } from "./assets/fortschritt.js";
import * as E from "./engine.js";
import { LEVELS, WELTEN } from "./levels.js";
import {
  bildVon,
  artVon,
  kachelMalen,
  aufloesung,
  partikelNeu,
  partikelMalen,
  zielSymbol,
  SORTEN,
  SPEZIAL_NAMEN,
  ZUTATEN,
  FARBE_HELL,
} from "./bonbons.js?v=20261023c";

const SPIEL = "zuckerzauber";
const fmt = new Intl.NumberFormat("de-DE");

const el = {
  karte: document.getElementById("karte"),
  pfad: document.getElementById("pfad"),
  weiter: document.getElementById("weiter"),
  fortschritt: document.getElementById("fortschritt"),
  spiel: document.getElementById("spielfeld"),
  titel: document.getElementById("level-titel"),
  zuege: document.getElementById("hud-zuege"),
  ziele: document.getElementById("hud-ziele"),
  punkte: document.getElementById("hud-punkte"),
  balken: document.getElementById("punkte-balken"),
  rahmen: document.getElementById("brett-rahmen"),
  canvas: document.getElementById("brett"),
  banner: document.getElementById("banner"),
  status: document.getElementById("status"),
  hinweis: document.getElementById("zz-hinweis"),
  topliste: document.getElementById("topliste"),
};
const ctx = el.canvas.getContext("2d");

/* ============================================================
   Fortschritt
   ============================================================ */
const levelId = (l) => `${l.w + 1}-${l.n}`;
function bestAlle() {
  const b = lade(SPIEL, "best", {});
  return b && typeof b === "object" ? b : {};
}
const bestVon = (l) => bestAlle()[levelId(l)] || null;
const istFrei = (i) => i === 0 || !!bestVon(LEVELS[i - 1]);
const summePunkte = () => LEVELS.reduce((s, l) => s + (Number(bestVon(l)?.p) || 0), 0);
const summeSterne = () => LEVELS.reduce((s, l) => s + (Number(bestVon(l)?.st) || 0), 0);
const sternText = (n) => "★".repeat(n) + "☆".repeat(3 - n);
const naechstesIndex = () => {
  const i = LEVELS.findIndex((l) => !bestVon(l));
  return i < 0 ? LEVELS.length - 1 : i;
};

function ansagen(text) {
  el.status.textContent = "";
  requestAnimationFrame(() => (el.status.textContent = text));
}

/* ============================================================
   Klang (eigene Synthese, folgt dem gemeinsamen Ton-Schalter)
   ============================================================ */
let ac = null;
function ton(freq, dauer, typ = "sine", laut = 0.18, start = 0, gleit = 0) {
  if (!istTonAn()) return;
  try {
    ac ??= new AudioContext();
    if (ac.state === "suspended") ac.resume();
    const t0 = ac.currentTime + start;
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = typ;
    o.frequency.setValueAtTime(freq, t0);
    if (gleit) o.frequency.exponentialRampToValueAtTime(freq * gleit, t0 + dauer);
    g.gain.setValueAtTime(laut, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dauer);
    o.connect(g).connect(ac.destination);
    o.start(t0);
    o.stop(t0 + dauer + 0.02);
  } catch {
    /* kein Ton möglich */
  }
}
const klang = {
  tausch: () => ton(520, 0.08, "triangle", 0.12, 0, 1.4),
  falsch: () => {
    ton(240, 0.1, "square", 0.06);
    ton(200, 0.12, "square", 0.06, 0.09);
  },
  plopp: (k) => {
    const f = 440 * Math.pow(2, Math.min(k, 10) / 6);
    ton(f, 0.12, "sine", 0.2, 0, 1.6);
    ton(f * 2, 0.06, "triangle", 0.06, 0.02);
  },
  spezial: () => {
    ton(300, 0.35, "sawtooth", 0.07, 0, 3);
    ton(900, 0.25, "sine", 0.1, 0.05, 0.5);
  },
  neu: () => {
    ton(660, 0.1, "triangle", 0.12);
    ton(990, 0.14, "triangle", 0.12, 0.08);
  },
  kiste: () => ton(160, 0.12, "square", 0.08, 0, 0.6),
  zutat: () => [523, 659, 784].forEach((f, i) => ton(f, 0.15, "triangle", 0.14, i * 0.07)),
  sieg: () =>
    [523, 659, 784, 1047, 1319].forEach((f, i) => ton(f, 0.25, "triangle", 0.16, i * 0.1)),
  verloren: () => [392, 349, 311, 262].forEach((f, i) => ton(f, 0.3, "sine", 0.14, i * 0.16)),
};

/* ============================================================
   Levelkarte (App-Stil: ein Pfad von unten nach oben, Welt für Welt)
   ============================================================ */
const THEMEN = [
  ["#ffd6e7", "#ffb3d1", "#ff5fa2"],
  ["#c9f2d0", "#8fdba0", "#2e9e4f"],
  ["#f6d7a7", "#d9a35b", "#9a5b1e"],
  ["#e3e9ff", "#b8c7ff", "#6c7dff"],
  ["#b98a6a", "#7a4b2f", "#f2c08a"],
  ["#ffe08a", "#ff9f6b", "#e0466b"],
  ["#6d6a7c", "#3b3846", "#c3b7ff"],
  ["#f5e6c8", "#e8c99a", "#b27b3b"],
  ["#fff1a8", "#ffd36b", "#ff7a1a"],
  ["#2a2560", "#120f33", "#ffd84d"],
];
const PRO_WELT = 15;
const SCHRITT = 74;

function deko(w, hoehe) {
  // Kleine eigene Zierelemente je Welt (Lutscher, Wolken, Sterne, Bonbons) –
  // einzeln positioniert, damit sie bei jeder Breite unverzerrt bleiben
  const [, , ak] = THEMEN[w];
  const rnd = E.zufall(w * 77 + 3);
  let s = "";
  for (let k = 0; k < 9; k++) {
    const x = (k % 2 ? 74 + rnd() * 20 : 4 + rnd() * 20).toFixed(1);
    const y = (90 + rnd() * (hoehe - 130)).toFixed(0);
    const gr = Math.round(26 + rnd() * 26);
    const dreh = Math.round(rnd() * 60 - 30);
    const art = (w + k) % 4;
    let svg;
    if (art === 0)
      svg = `<rect x="22" y="22" width="4" height="26" rx="2" fill="#fff"/><circle cx="24" cy="18" r="15" fill="${ak}"/><path d="M24 18m-9 0a9 9 0 1 1 9 9a5 5 0 1 1 -5 -5" stroke="#fff" stroke-width="3" fill="none"/>`;
    else if (art === 1)
      svg = `<g fill="#fff"><circle cx="24" cy="26" r="11"/><circle cx="35" cy="29" r="8"/><circle cx="13" cy="29" r="8"/><rect x="8" y="29" width="32" height="8" rx="4"/></g>`;
    else if (art === 2)
      svg = `<path fill="${ak}" stroke="#fff" stroke-width="2" stroke-linejoin="round" d="M24 6l5 11 12 1-9 8 3 12-11-6-11 6 3-12-9-8 12-1z"/>`;
    else
      svg = `<rect x="12" y="17" width="24" height="14" rx="7" fill="${ak}"/><path d="M12 24 3 17v14zM36 24l9-7v14z" fill="#fff"/><path d="M18 19l4 10M25 19l4 10" stroke="#fff" stroke-width="2" opacity="0.6"/>`;
    s += `<svg class="deko-teil" viewBox="0 0 48 48" style="left:${x}%;top:${y}px;width:${gr}px;height:${gr}px;transform:rotate(${dreh}deg)" aria-hidden="true">${svg}</svg>`;
  }
  return s;
}
const SCHLOSS =
  '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><rect x="3" y="7" width="10" height="8" rx="2" fill="#fff"/><path d="M5 7V5a3 3 0 0 1 6 0v2" stroke="#fff" stroke-width="2" fill="none"/></svg>';

function karteZeigen() {
  stopAlles();
  el.spiel.hidden = true;
  el.karte.hidden = false;
  el.pfad.textContent = "";
  const naechstes = naechstesIndex();
  for (let w = WELTEN.length - 1; w >= 0; w--) {
    const levels = LEVELS.filter((l) => l.w === w);
    if (!levels.length) continue;
    const hoehe = levels.length * SCHRITT + 110;
    const [a, b, ak] = THEMEN[w];
    const sek = document.createElement("section");
    sek.className = "welt";
    sek.style.cssText = `--a:${a};--b:${b};--ak:${ak};height:${hoehe}px`;
    sek.setAttribute("aria-label", `Welt ${w + 1}: ${WELTEN[w]}`);
    // Pfad (SVG) + Deko
    const punkte = levels.map((l, k) => [
      50 + Math.sin(k * 0.85 + w) * 30,
      hoehe - 50 - k * SCHRITT,
    ]);
    const d = punkte.map(([x, y], k) => `${k ? "L" : "M"}${x} ${y}`).join("");
    sek.innerHTML = `${deko(w, hoehe)}<svg class="welt-deko" viewBox="0 0 100 ${hoehe}" preserveAspectRatio="none" aria-hidden="true">
      <path d="${d}" class="pfad-linie" vector-effect="non-scaling-stroke"/><path d="${d}" class="pfad-punkte" vector-effect="non-scaling-stroke"/></svg>
      <h3 class="welt-schild"><small>Welt ${w + 1}</small>${WELTEN[w]}</h3>`;
    levels.forEach((l, k) => {
      const i = LEVELS.indexOf(l);
      const best = bestVon(l);
      const frei = istFrei(i);
      const b2 = document.createElement("button");
      b2.type = "button";
      b2.className = "knoten" + (best ? " geschafft" : "") + (i === naechstes ? " aktuell" : "");
      b2.style.left = `${punkte[k][0]}%`;
      b2.style.top = `${punkte[k][1]}px`;
      b2.disabled = !frei;
      b2.dataset.i = i;
      b2.innerHTML = `<span class="nr">${i + 1}</span><span class="st">${best ? sternText(best.st) : frei ? "" : SCHLOSS}</span>`;
      b2.setAttribute(
        "aria-label",
        `Level ${i + 1}` +
          (best
            ? `, ${best.st} Sterne, beste Punkte ${fmt.format(best.p)}`
            : frei
              ? ", offen"
              : ", gesperrt"),
      );
      b2.addEventListener("click", () => levelVorschau(i));
      sek.append(b2);
    });
    el.pfad.append(sek);
  }
  el.fortschritt.textContent = `${summeSterne()} von ${LEVELS.length * 3} Sternen · ${fmt.format(summePunkte())} Punkte`;
  el.weiter.textContent = bestVon(LEVELS[naechstes])
    ? "Nochmal spielen"
    : `Weiter: Level ${naechstes + 1}`;
  requestAnimationFrame(() => {
    const k = el.pfad.querySelector(".knoten.aktuell");
    if (k) el.pfad.scrollTop = k.offsetTop + k.parentElement.offsetTop - el.pfad.clientHeight / 2;
  });
}

function zielBeschreibung(l) {
  const t = [];
  if (l.ziele.punkte) t.push(`${fmt.format(l.ziele.punkte)} Punkte erreichen`);
  if (l.ziele.gelee) t.push("das ganze Gelee entfernen");
  if (l.ziele.kiste) t.push("alle Kekse und Schokoblöcke zerbröseln");
  if (l.ziele.zutaten)
    t.push(
      `${l.ziele.zutaten} ${l.ziele.zutaten === 1 ? ZUTATEN[l.n % 2] : ZUTATEN[l.n % 2] === "Kirsche" ? "Kirschen" : "Haselnüsse"} nach unten bringen`,
    );
  return t.join(" und ");
}

/* ---------- Spielelemente erklären ---------- */
const zutatName = (l, mehr) =>
  ZUTATEN[l.n % 2] === "Kirsche"
    ? mehr
      ? "Kirschen"
      : "Kirsche"
    : mehr
      ? "Haselnüsse"
      : "Haselnuss";
const feldHat = (l, ch) => l.feld.some((r) => r.includes(ch));
/** Elemente eines Levels: [{art, titel, text}] – art passt zu bildUrl(). */
function elemente(l) {
  const e = [];
  if (l.ziele.punkte)
    e.push({
      art: "punkte",
      titel: `${fmt.format(l.ziele.punkte)} Punkte`,
      text: "Bilde Reihen aus 3 oder mehr gleichen Bonbons. Große Reihen und Kettenreaktionen bringen viele Punkte.",
    });
  if (l.ziele.gelee || feldHat(l, "g") || feldHat(l, "G"))
    e.push({
      art: "gelee",
      titel: l.ziele.gelee ? "Gelee entfernen" : "Gelee",
      text:
        "Türkises Gelee liegt unter Bonbons. Löse ein Bonbon genau auf diesem Feld auf, dann verschwindet das Gelee." +
        (feldHat(l, "G")
          ? " Dunkelblaues Doppel-Gelee (mit hellem Innenrand) braucht das zweimal."
          : ""),
    });
  if (feldHat(l, "k") || feldHat(l, "K")) {
    if (feldHat(l, "k"))
      e.push({
        art: "keks",
        titel: "Kekse zerbröseln",
        text: "Kekse lassen sich nicht bewegen. Bilde eine Reihe direkt daneben (links, rechts, oben oder unten) – oder spreng sie mit einem Spezial-Bonbon.",
      });
    if (feldHat(l, "K"))
      e.push({
        art: "schoko",
        titel: "Schokoblöcke knacken",
        text: "Wie Kekse, aber doppelt so fest: Der erste Treffer macht daraus einen Keks, der zweite zerbröselt ihn.",
      });
  }
  if (l.ziele.zutaten) {
    const n = l.ziele.zutaten;
    e.push({
      art: "zutat",
      titel: `${n} ${zutatName(l, n > 1)} nach unten`,
      text: `Die ${zutatName(l, true)} fallen wie Bonbons, lassen sich aber nicht auflösen. Löse die Bonbons darunter auf, bis sie unten ankommen – dann sind sie geschafft.`,
    });
  }
  return e;
}
/** Erstes Level, in dem ein Element vorkommt (für den NEU-Hinweis). */
const ERSTES = {};
LEVELS.forEach((l, i) => {
  for (const x of elemente(l)) if (!(x.art in ERSTES)) ERSTES[x.art] = i;
});
const bildCache = new Map();
function bildUrl(art, l = L) {
  const key = art === "zutat" ? `zutat:${l.n % 2}` : art;
  if (bildCache.has(key)) return bildCache.get(key);
  let url;
  if (art === "gelee" || art === "punkte") url = zielSymbol(art === "gelee" ? "gelee" : "punkte");
  else {
    const c = document.createElement("canvas");
    const dd = window.devicePixelRatio || 1;
    c.width = c.height = 40 * dd;
    c.getContext("2d").drawImage(bildVon(key, 40), 0, 0, 40 * dd, 40 * dd);
    url = c.toDataURL();
  }
  bildCache.set(key, url);
  return url;
}
function erklaerKarte(x, l, i) {
  const k = document.createElement("div");
  k.className = "zz-erklaer";
  const img = document.createElement("img");
  img.src = bildUrl(x.art, l);
  img.alt = "";
  img.width = img.height = 40;
  const t = document.createElement("div");
  const b = document.createElement("strong");
  b.textContent = x.titel;
  if (i !== undefined && ERSTES[x.art] === i && i > 0) {
    const n = document.createElement("span");
    n.className = "zz-neu";
    n.textContent = "NEU";
    b.append(" ", n);
  }
  const p = document.createElement("span");
  p.textContent = x.text;
  t.append(b, p);
  k.append(img, t);
  return k;
}

function levelVorschau(i) {
  const l = LEVELS[i];
  const best = bestVon(l);
  document.getElementById("spiel-dialog")?.remove();
  const d = document.createElement("dialog");
  d.className = "spiel-dialog zz-dialog";
  d.id = "spiel-dialog";
  d.innerHTML = `<p class="klein"></p><h2></h2><p class="gross sterne-gross"></p><p class="info"></p><div class="zz-erklaerungen"></div><p class="info klein"></p>
    <div class="aktionen"><button class="knopf primaer" data-r="los">Los geht's!</button><button class="knopf" data-r="zu">Zurück</button></div>`;
  d.querySelector(".klein").textContent = `Welt ${l.w + 1} · ${WELTEN[l.w]}`;
  d.querySelector("h2").textContent = `LEVEL ${i + 1}`;
  d.querySelector(".gross").textContent = sternText(best?.st || 0);
  d.querySelectorAll(".info")[0].textContent = `Schaffe das in ${l.zuege} Zügen:`;
  d.querySelector(".zz-erklaerungen").append(...elemente(l).map((x) => erklaerKarte(x, l, i)));
  d.querySelectorAll(".info")[1].textContent = best
    ? `Dein Bestwert: ${fmt.format(best.p)} Punkte`
    : `Sterne ab ${fmt.format(l.sterne[1])} und ${fmt.format(l.sterne[2])} Punkten.`;
  d.addEventListener("click", (e) => {
    const r = e.target.closest("[data-r]")?.dataset.r;
    if (!r) return;
    d.close();
    if (r === "los") levelStarten(i);
  });
  d.addEventListener("close", () => d.remove());
  document.body.append(d);
  d.showModal();
}

/* ============================================================
   Spielzustand
   ============================================================ */
let L = null; // Level-Daten
let LI = 0; // Level-Index
let B = null; // Engine-Brett (Wahrheit)
let D = null; // Anzeige-Brett (was gerade gemalt wird)
let rnd = null;
let zuegeRest = 0;
let beschaeftigt = false;
let fertig = false;
let auswahl = -1;
let cursor = -1;
let tastatur = false;
let tipp = null;
let tippUhr = 0;
let ziehen = null;
let g = 48; // Zellgröße in CSS-Pixeln
const off = { x: null, y: null, s: null }; // Versatz (in Zellen) + Skalierung je Zelle
let gx = null,
  gy = null; // Versatz beim Tauschen
let fallend = null; // {start, dauer, vonY:Float32Array}
let wackeln = null; // Hindernisse, die gerade getroffen wurden
const ueber = []; // Overlays: verschwindende Bonbons
const effekte = [];
const partikel = [];
const texte = [];
let laufId = 0;
let zuletzt = 0;

const zutatArt = () => L.n % 2;
const reduziert = () => bewegungReduziert();

function zufallSeed() {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0];
}

function levelStarten(i) {
  stopAlles();
  LI = i;
  L = LEVELS[i];
  rnd = E.zufall(zufallSeed());
  B = E.brettNeu(L, rnd);
  D = E.momentaufnahme(B);
  off.x = new Float32Array(B.N);
  off.y = new Float32Array(B.N);
  off.s = new Float32Array(B.N).fill(1);
  gx = new Float32Array(B.N);
  gy = new Float32Array(B.N);
  zuegeRest = L.zuege;
  beschaeftigt = false;
  fertig = false;
  auswahl = -1;
  cursor = Math.floor(B.h / 2) * B.w + Math.floor(B.w / 2);
  tipp = null;
  ueber.length = effekte.length = partikel.length = texte.length = 0;
  el.karte.hidden = true;
  el.spiel.hidden = false;
  el.titel.textContent = `Level ${i + 1} · ${WELTEN[L.w]}`;
  el.rahmen.style.setProperty("--a", THEMEN[L.w][0]);
  el.rahmen.style.setProperty("--b", THEMEN[L.w][1]);
  el.rahmen.style.setProperty("--ak", THEMEN[L.w][2]);
  zielHudBauen();
  groesseAnpassen();
  hudAktualisieren();
  tippUhrNeu();
  el.spiel.scrollIntoView({ block: "start", behavior: reduziert() ? "auto" : "smooth" });
  el.canvas.focus({ preventScroll: true });
  ansagen(`Level ${i + 1}. Ziel: ${zielBeschreibung(L)}. ${L.zuege} Züge.`);
  const id = ++laufId;
  zuletzt = performance.now();
  const schleife = (t) => {
    if (id !== laufId) return;
    malen(Math.min(0.05, (t - zuletzt) / 1000), t);
    zuletzt = t;
    requestAnimationFrame(schleife);
  };
  requestAnimationFrame(schleife);
}

function stopAlles() {
  laufId++;
  clearTimeout(tippUhr);
}

function groesseAnpassen() {
  if (!B) return;
  const platz = Math.min(el.rahmen.clientWidth - 24, 600);
  g = Math.max(28, Math.min(64, Math.floor(platz / B.w)));
  const d = window.devicePixelRatio || 1;
  aufloesung(d);
  el.canvas.width = B.w * g * d;
  el.canvas.height = B.h * g * d;
  el.canvas.style.width = `${B.w * g}px`;
  el.canvas.style.height = `${B.h * g}px`;
  ctx.setTransform(d, 0, 0, d, 0, 0);
}
window.addEventListener("resize", () => {
  if (!el.spiel.hidden) groesseAnpassen();
});

/* ---------- HUD ---------- */
let zielEls = [];
function zielHudBauen() {
  el.ziele.textContent = "";
  zielEls = [];
  const els = elemente(L);
  for (const t of E.zielStand(B, L.ziele).teile) {
    const d = document.createElement("button");
    d.type = "button";
    d.className = "ziel";
    const arten =
      t.art === "kiste"
        ? els.filter((x) => x.art === "keks" || x.art === "schoko").map((x) => x.art)
        : [t.art === "zutaten" ? "zutat" : t.art];
    for (const a of arten) {
      const img = document.createElement("img");
      img.src = bildUrl(a);
      img.alt = "";
      img.width = img.height = 28;
      d.append(img);
    }
    const txt = document.createElement("span");
    txt.className = "ziel-text";
    const name = document.createElement("small");
    name.textContent = {
      punkte: "Punkte",
      gelee: "Gelee",
      kiste: arten.length > 1 ? "Kekse + Schoko" : "Kekse",
      zutaten: zutatName(L, true),
    }[t.art];
    const s = document.createElement("b");
    txt.append(name, s);
    d.append(txt);
    d.addEventListener("click", () => {
      hinweisZeigen(arten.map((a) => els.find((x) => x.art === a)).filter(Boolean));
    });
    el.ziele.append(d);
    zielEls.push({ art: t.art, s, d, name: name.textContent });
  }
  el.hinweis.hidden = true;
  zutatErklaert = false;
}
let zutatErklaert = false;
/* Erklärung unter dem HUD (Ziel-Chip oder Hindernis angetippt) */
let hinweisUhr = 0;
function hinweisZeigen(liste) {
  if (!liste.length) return;
  clearTimeout(hinweisUhr);
  el.hinweis.replaceChildren(...liste.map((x) => erklaerKarte(x, L)));
  el.hinweis.hidden = false;
  ansagen(liste.map((x) => `${x.titel}: ${x.text}`).join(" "));
  hinweisUhr = setTimeout(() => (el.hinweis.hidden = true), 9000);
}

function hudAktualisieren(punkteAnzeige = B.punkte) {
  el.zuege.textContent = zuegeRest;
  el.zuege.parentElement.classList.toggle("knapp", zuegeRest <= 5);
  el.punkte.textContent = fmt.format(punkteAnzeige);
  const stand = E.zielStand(B, L.ziele);
  for (const z of zielEls) {
    const t = stand.teile.find((x) => x.art === z.art);
    const rest = Math.max(0, t.soll - t.ist);
    z.s.textContent = z.art === "punkte" ? fmt.format(t.soll) : rest ? String(rest) : "✓";
    z.d.setAttribute(
      "aria-label",
      `${z.name}: ${z.art === "punkte" ? `Ziel ${fmt.format(t.soll)}` : rest ? `noch ${rest}` : "geschafft"}. Antippen für Erklärung.`,
    );
    z.d.classList.toggle("erledigt", rest === 0);
  }
  // Punktebalken mit drei Sternmarken
  const max = L.sterne[2] * 1.12;
  el.balken.style.setProperty("--wert", `${Math.min(100, (punkteAnzeige / max) * 100)}%`);
  el.balken.querySelectorAll(".sternmarke").forEach((m, k) => {
    const schwelle = k === 0 ? Math.max(L.sterne[0], 1) : L.sterne[k];
    m.style.left = `${(schwelle / max) * 100}%`;
    m.classList.toggle(
      "an",
      punkteAnzeige >= schwelle && (k > 0 || stand.erreicht || !!L.ziele.punkte),
    );
  });
  el.balken.setAttribute("aria-valuenow", String(punkteAnzeige));
}

/* ============================================================
   Zeichnen
   ============================================================ */
const zx = (i) => (i % B.w) * g;
const zy = (i) => Math.floor(i / B.w) * g;

function malen(dt, t) {
  if (!B) return;
  const W = B.w * g,
    H = B.h * g;
  ctx.clearRect(0, 0, W, H);
  // Kacheln + Gelee
  for (let i = 0; i < B.N; i++) {
    if (!B.m[i]) continue;
    const r = Math.floor(i / B.w),
      c = i % B.w;
    kachelMalen(ctx, c * g, r * g, g, (r + c) % 2 === 0, D.g[i]);
  }
  // Fall-Animation fortschreiben
  let fallFertig = true;
  for (let i = 0; i < B.N; i++) {
    if (off.y[i] !== 0) {
      const v = (fallend?.v[i] || 0) + dt * 38;
      if (fallend) fallend.v[i] = v;
      off.y[i] = Math.min(0, off.y[i] + v * dt);
      if (off.y[i] < 0) fallFertig = false;
      else if (fallend) fallend.huepf[i] = 0.18;
    }
    if (off.x[i] !== 0) {
      const s = Math.sign(off.x[i]);
      off.x[i] -= s * dt * 9;
      if (Math.sign(off.x[i]) !== s) off.x[i] = 0;
      else fallFertig = false;
    }
  }
  if (fallend && fallFertig) {
    const f = fallend;
    fallend = null;
    f.fertig();
  }

  // Bonbons (mit Ausschnitt auf das Brett, damit Neues von oben "hereinfällt")
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, W, H);
  ctx.clip();
  const puls = 1 + Math.sin(t / 160) * 0.06;
  for (let i = 0; i < B.N; i++) {
    if (!B.m[i]) continue;
    let px = zx(i),
      py = zy(i);
    if (D.x[i]) {
      let dx = 0;
      if (wackeln?.has(i)) dx = Math.sin(t / 20) * g * 0.05;
      ctx.drawImage(bildVon(D.x[i] === 2 ? "schoko" : "keks", g), px + dx, py, g, g);
      continue;
    }
    const art = artVon(D.f[i], D.s[i], zutatArt());
    if (!art) continue;
    px += (off.x[i] + gx[i]) * g;
    py += (off.y[i] + gy[i]) * g;
    let sk = off.s[i];
    if (i === auswahl) sk *= puls;
    if (tipp && (i === tipp[0] || i === tipp[1]) && !reduziert()) {
      const w = Math.sin(t / 90) * g * 0.06;
      if (Math.abs(tipp[0] - tipp[1]) === 1) px += i === tipp[0] ? w : -w;
      else py += i === tipp[0] ? w : -w;
    }
    let sy = sk;
    const hp = fallend?.huepf?.[i];
    if (hp > 0) {
      fallend.huepf[i] = Math.max(0, hp - dt);
      sy *= 1 - Math.sin((hp / 0.18) * Math.PI) * 0.12;
    }
    const bw = g * sk,
      bh = g * sy;
    ctx.drawImage(bildVon(art, g), px + (g - bw) / 2, py + (g - bh), bw, bh);
  }
  // Verschwindende Bonbons (aufblähen, dann weg)
  for (let k = ueber.length - 1; k >= 0; k--) {
    const u = ueber[k];
    u.t += dt;
    const p = u.t / u.dauer;
    if (p >= 1) {
      ueber.splice(k, 1);
      continue;
    }
    const s = p < 0.35 ? 1 + p * 0.6 : 1.21 * (1 - (p - 0.35) / 0.65);
    ctx.globalAlpha = Math.min(1, 1.6 - p * 1.4);
    const bw = g * s;
    ctx.drawImage(bildVon(u.art, g), u.x + (g - bw) / 2, u.y + u.dy * g * p + (g - bw) / 2, bw, bw);
    ctx.globalAlpha = 1;
  }
  ctx.restore();

  // Effekte
  for (let k = effekte.length - 1; k >= 0; k--) {
    const e = effekte[k];
    e.t += dt;
    const p = e.t / e.dauer;
    if (p >= 1) {
      effekte.splice(k, 1);
      continue;
    }
    effektMalen(e, p, W, H);
  }
  partikelMalen(ctx, partikel, dt, g);
  // Punkte-Texte
  ctx.textAlign = "center";
  ctx.font = `700 ${Math.round(g * 0.36)}px "Press Start 2P", monospace`;
  for (let k = texte.length - 1; k >= 0; k--) {
    const tx = texte[k];
    tx.t += dt;
    const p = tx.t / 0.9;
    if (p >= 1) {
      texte.splice(k, 1);
      continue;
    }
    ctx.globalAlpha = 1 - p * p;
    ctx.lineWidth = 4;
    ctx.strokeStyle = "rgba(40,0,30,0.8)";
    ctx.strokeText(tx.text, tx.x, tx.y - p * g * 0.8);
    ctx.fillStyle = tx.farbe;
    ctx.fillText(tx.text, tx.x, tx.y - p * g * 0.8);
    ctx.globalAlpha = 1;
  }
  // Auswahl / Tastatur-Cursor
  if (auswahl >= 0) ring(auswahl, "#fff", 3, []);
  if (tastatur && cursor >= 0 && document.activeElement === el.canvas)
    ring(cursor, "#ffe066", 2.5, [5, 4]);
}

function ring(i, farbe, breite, strich) {
  ctx.save();
  ctx.strokeStyle = farbe;
  ctx.lineWidth = breite;
  ctx.setLineDash(strich);
  ctx.shadowColor = farbe;
  ctx.shadowBlur = 8;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(zx(i) + 2, zy(i) + 2, g - 4, g - 4, g * 0.2);
  else ctx.rect(zx(i) + 2, zy(i) + 2, g - 4, g - 4);
  ctx.stroke();
  ctx.restore();
}

function effektMalen(e, p, W, H) {
  const cx = zx(e.i) + g / 2,
    cy = zy(e.i) + g / 2;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const a = 1 - p;
  if (e.typ === "zeile" || e.typ === "spalte" || e.typ === "kreuz") {
    const breite = (e.breite || 1) * g;
    const lagen = e.typ === "kreuz" ? ["zeile", "spalte"] : [e.typ];
    for (const lage of lagen) {
      const v =
        lage === "zeile"
          ? ctx.createLinearGradient(0, cy - breite / 2, 0, cy + breite / 2)
          : ctx.createLinearGradient(cx - breite / 2, 0, cx + breite / 2, 0);
      v.addColorStop(0, "rgba(255,255,255,0)");
      v.addColorStop(0.5, `rgba(255,255,230,${0.9 * a})`);
      v.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = v;
      const lang = p * 2.2;
      if (lage === "zeile") ctx.fillRect(cx - W * lang, cy - breite / 2, W * lang * 2, breite);
      else ctx.fillRect(cx - breite / 2, cy - H * lang, breite, H * lang * 2);
    }
  } else if (e.typ === "bombe") {
    const r = g * (0.5 + (e.radius + 0.6) * p * 1.2);
    ctx.strokeStyle = `rgba(255,240,200,${a})`;
    ctx.lineWidth = g * 0.35 * a + 1;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    const v = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    v.addColorStop(0, `rgba(255,255,255,${0.6 * a})`);
    v.addColorStop(1, "rgba(255,180,220,0)");
    ctx.fillStyle = v;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  } else if (e.typ === "stern") {
    ctx.strokeStyle = `rgba(255,255,255,${a})`;
    ctx.lineWidth = 2.5;
    ctx.shadowColor = FARBE_HELL[e.farbe] || "#fff";
    ctx.shadowBlur = 10;
    for (const z of e.ziele || []) {
      const tx = zx(z) + g / 2,
        ty = zy(z) + g / 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + (tx - cx) * Math.min(1, p * 3), cy + (ty - cy) * Math.min(1, p * 3));
      ctx.stroke();
    }
  } else if (e.typ === "alles") {
    ctx.fillStyle = `rgba(255,255,255,${0.7 * a})`;
    ctx.fillRect(0, 0, W, H);
  }
  ctx.restore();
}

/* ============================================================
   Phasen abspielen
   ============================================================ */
const warte = (ms) => new Promise((r) => setTimeout(r, reduziert() ? Math.min(ms, 30) : ms));
const MELDUNGEN = ["", "", "Klasse!", "Super!", "Zuckerschock!", "Fantastisch!"];

function banner(text, art = "") {
  el.banner.textContent = text;
  el.banner.className = "banner " + art;
  void el.banner.offsetWidth;
  el.banner.classList.add("zeigen");
  clearTimeout(banner.uhr);
  banner.uhr = setTimeout(() => el.banner.classList.remove("zeigen"), 1300);
}

async function abspielen(phasen) {
  let maxKaskade = 0;
  for (const ph of phasen) {
    if (laufId === 0) return;
    if (ph.typ === "tausch") {
      await tauschAnimieren(ph.a, ph.b);
    } else if (ph.typ === "weg") {
      maxKaskade = Math.max(maxKaskade, ph.kaskade + 1);
      await wegAnimieren(ph);
    } else if (ph.typ === "fall") {
      await fallAnimieren(ph);
    } else if (ph.typ === "mischen") {
      banner("Gemischt!", "klein");
      ansagen("Keine Züge mehr – das Brett wurde neu gemischt.");
      for (let i = 0; i < B.N; i++) off.s[i] = 0.2;
      Object.assign(D, ph.bild);
      const t0 = performance.now();
      await new Promise((r) => {
        const f = () => {
          const p = Math.min(1, (performance.now() - t0) / (reduziert() ? 1 : 450));
          for (let i = 0; i < B.N; i++) off.s[i] = 0.2 + 0.8 * p;
          p < 1 ? requestAnimationFrame(f) : r();
        };
        f();
      });
    } else if (ph.typ === "rausch") {
      Object.assign(D, ph.bild);
      for (const i of ph.zellen)
        partikelNeu(partikel, zx(i) + g / 2, zy(i) + g / 2, "#fff", reduziert() ? 0 : 5, g);
      klang.neu();
      await warte(260);
    }
  }
  if (maxKaskade >= 3) banner(MELDUNGEN[Math.min(5, maxKaskade)]);
}

function tauschAnimieren(a, b) {
  klang.tausch();
  // D hat noch den alten Stand: tauschen und den Versatz rückwärts setzen
  const f = D.f[a];
  D.f[a] = D.f[b];
  D.f[b] = f;
  const s = D.s[a];
  D.s[a] = D.s[b];
  D.s[b] = s;
  const dx = (b % B.w) - (a % B.w),
    dy = Math.floor(b / B.w) - Math.floor(a / B.w);
  return gleiten(
    [
      [a, dx, dy],
      [b, -dx, -dy],
    ],
    150,
  );
}

function gleiten(liste, ms) {
  if (reduziert()) return Promise.resolve();
  const t0 = performance.now();
  return new Promise((r) => {
    const f = () => {
      const p = Math.min(1, (performance.now() - t0) / ms);
      const e = 1 - (1 - p) * (1 - p);
      for (const [i, dx, dy] of liste) {
        gx[i] = dx * (1 - e);
        gy[i] = dy * (1 - e);
      }
      if (p < 1) requestAnimationFrame(f);
      else {
        for (const [i] of liste) gx[i] = gy[i] = 0;
        r();
      }
    };
    f();
  });
}

async function wegAnimieren(ph) {
  const neuOrte = new Set(ph.neu.map((n) => n.i));
  let kisteGetroffen = false;
  const getroffen = new Set();
  for (const z of ph.zellen) {
    const px = zx(z.i),
      py = zy(z.i);
    if (z.kiste) {
      kisteGetroffen = true;
      getroffen.add(z.i);
      partikelNeu(
        partikel,
        px + g / 2,
        py + g / 2,
        z.kiste === 2 ? "#6b3a1c" : "#d99b4a",
        reduziert() ? 0 : 8,
        g,
      );
      continue;
    }
    const art = artVon(z.f, z.s, zutatArt());
    if (!art) continue;
    // Bonbons, die zu einem Spezialstein verschmelzen, fliegen zu ihm
    let dy = 0;
    if (!neuOrte.has(z.i)) ueber.push({ art, x: px, y: py, t: 0, dauer: 0.28, dy });
    partikelNeu(
      partikel,
      px + g / 2,
      py + g / 2,
      z.f < 6 ? SORTEN[z.f].hell : "#fff",
      reduziert() ? 0 : 4,
      g,
    );
  }
  for (const e of ph.effekte) {
    const eff = { ...e, t: 0, dauer: e.typ === "stern" ? 0.5 : 0.4 };
    if (e.typ === "stern") eff.ziele = ph.zellen.filter((z) => z.f === e.farbe).map((z) => z.i);
    effekte.push(eff);
  }
  if (ph.effekte.length) klang.spezial();
  klang.plopp(ph.kaskade);
  if (kisteGetroffen) {
    klang.kiste();
    wackeln = getroffen;
  }
  if (ph.neu.length) klang.neu();
  // Punkte-Text in der Mitte der Treffer
  const normale = ph.zellen.filter((z) => !z.kiste);
  if (normale.length && ph.punkte) {
    const mx = normale.reduce((s, z) => s + zx(z.i), 0) / normale.length + g / 2;
    const my = normale.reduce((s, z) => s + zy(z.i), 0) / normale.length + g / 2;
    texte.push({
      text: fmt.format(ph.punkte),
      x: mx,
      y: my,
      t: 0,
      farbe: normale[0].f < 6 ? SORTEN[normale[0].f].hell : "#fff",
    });
  }
  // Anzeige auf den Stand nach dem Löschen setzen
  Object.assign(D, ph.bild);
  for (const n of ph.neu) {
    off.s[n.i] = 0.3;
  }
  hudAktualisieren(ph.bild.punkte);
  const t0 = performance.now();
  await new Promise((r) => {
    const f = () => {
      const p = Math.min(1, (performance.now() - t0) / (reduziert() ? 1 : 230));
      for (const n of ph.neu) off.s[n.i] = 0.3 + 0.7 * p + Math.sin(p * Math.PI) * 0.25;
      p < 1 ? requestAnimationFrame(f) : r();
    };
    f();
  });
  wackeln = null;
  for (const n of ph.neu) off.s[n.i] = 1;
}

function fallAnimieren(ph) {
  Object.assign(D, ph.bild);
  for (const i of ph.raus) {
    ueber.push({ art: `zutat:${zutatArt()}`, x: zx(i), y: zy(i), t: 0, dauer: 0.5, dy: 1.2 });
    texte.push({ text: "5.000", x: zx(i) + g / 2, y: zy(i), t: 0, farbe: "#ffe066" });
  }
  if (ph.raus.length) {
    klang.zutat();
    ansagen("Eine Zutat ist unten angekommen!");
  }
  if (reduziert()) {
    hudAktualisieren(ph.bild.punkte);
    return Promise.resolve();
  }
  for (const { von, nach } of ph.wege) {
    off.y[nach] = Math.floor(von / B.w) - Math.floor(nach / B.w);
  }
  // Neue Steine starten oberhalb ihrer Spalte
  const proSpalte = new Map();
  for (const n of ph.neu)
    proSpalte.set(n.nach % B.w, Math.max(proSpalte.get(n.nach % B.w) || 0, n.hoehe));
  for (const n of ph.neu) {
    const c = n.nach % B.w;
    off.y[n.nach] = -(proSpalte.get(c) + 0.3);
  }
  hudAktualisieren(ph.bild.punkte);
  return new Promise((r) => {
    if (![...off.y].some((v) => v < 0)) return r();
    fallend = { v: new Float32Array(B.N).fill(2), huepf: new Float32Array(B.N), fertig: r };
  });
}

/* ============================================================
   Eingabe
   ============================================================ */
function zelleBei(e) {
  const r = el.canvas.getBoundingClientRect();
  const c = Math.floor(((e.clientX - r.left) / r.width) * B.w);
  const z = Math.floor(((e.clientY - r.top) / r.height) * B.h);
  if (c < 0 || z < 0 || c >= B.w || z >= B.h) return -1;
  const i = z * B.w + c;
  return B.m[i] ? i : -1;
}

el.canvas.addEventListener("pointerdown", (e) => {
  if (!B || beschaeftigt || fertig) return;
  tastatur = false;
  const i = zelleBei(e);
  if (i < 0) return;
  if (B.x[i] || B.f[i] === E.ZUTAT) {
    const a = B.x[i] === 2 ? "schoko" : B.x[i] ? "keks" : "zutat";
    const x =
      elemente(L).find((y) => y.art === a) ||
      (a === "keks" ? elemente({ ...L, feld: ["k"], ziele: {} })[0] : null);
    if (x && (B.x[i] || !zutatErklaert)) hinweisZeigen([x]);
    if (!B.x[i]) zutatErklaert = true;
    if (B.x[i]) {
      auswahl = -1;
      return;
    }
  }
  el.canvas.setPointerCapture?.(e.pointerId);
  if (auswahl >= 0 && auswahl !== i && E.nachbarn(B, auswahl, i)) {
    const a = auswahl;
    auswahl = -1;
    versuchen(a, i);
    return;
  }
  auswahl = auswahl === i ? -1 : i;
  ziehen = { i, x: e.clientX, y: e.clientY };
});
el.canvas.addEventListener("pointermove", (e) => {
  if (!ziehen || beschaeftigt) return;
  const dx = e.clientX - ziehen.x,
    dy = e.clientY - ziehen.y;
  const schwelle = (el.canvas.getBoundingClientRect().width / B.w) * 0.35;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < schwelle) return;
  const a = ziehen.i;
  ziehen = null;
  const c = a % B.w;
  let b = -1;
  if (Math.abs(dx) > Math.abs(dy)) b = dx > 0 ? (c < B.w - 1 ? a + 1 : -1) : c > 0 ? a - 1 : -1;
  else b = dy > 0 ? a + B.w : a - B.w;
  if (b < 0 || b >= B.N || !B.m[b]) return;
  auswahl = -1;
  versuchen(a, b);
});
const ziehenEnde = () => (ziehen = null);
el.canvas.addEventListener("pointerup", ziehenEnde);
el.canvas.addEventListener("pointercancel", ziehenEnde);

function zellText(i) {
  const r = Math.floor(i / B.w) + 1,
    c = (i % B.w) + 1;
  let t;
  if (!B.m[i]) t = "kein Feld";
  else if (B.x[i]) t = B.x[i] === 2 ? "Schokoblock" : "Keks";
  else if (B.f[i] === E.STERN_F) t = "Regenbogenstern";
  else if (B.f[i] === E.ZUTAT) t = ZUTATEN[zutatArt()];
  else if (B.f[i] < 0) t = "leer";
  else t = SORTEN[B.f[i]].name + (B.s[i] ? `, ${SPEZIAL_NAMEN[B.s[i]]}` : "");
  if (B.g[i]) t += B.g[i] === 2 ? ", doppeltes Gelee" : ", Gelee";
  return `Zeile ${r}, Spalte ${c}: ${t}`;
}

el.canvas.addEventListener("keydown", (e) => {
  if (!B || fertig) return;
  const richtung = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[
    e.key
  ];
  if (richtung) {
    e.preventDefault();
    tastatur = true;
    const r = Math.floor(cursor / B.w) + richtung[1],
      c = (cursor % B.w) + richtung[0];
    if (r < 0 || c < 0 || r >= B.h || c >= B.w) return;
    const ziel = r * B.w + c;
    if (auswahl >= 0 && !beschaeftigt) {
      const a = auswahl;
      auswahl = -1;
      if (B.m[ziel]) versuchen(a, ziel);
      return;
    }
    cursor = ziel;
    ansagen(zellText(cursor));
  } else if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    tastatur = true;
    if (beschaeftigt || !B.m[cursor]) return;
    auswahl = auswahl === cursor ? -1 : cursor;
    ansagen(
      auswahl >= 0
        ? `Ausgewählt: ${zellText(cursor)}. Pfeiltaste zum Tauschen.`
        : "Auswahl aufgehoben",
    );
  } else if (e.key === "Escape") {
    auswahl = -1;
  } else if (e.key === "h" || e.key === "H") {
    tippZeigen(true);
  }
});
el.canvas.addEventListener("focus", () => {
  if (tastatur) ansagen(zellText(cursor));
});

function tippUhrNeu() {
  clearTimeout(tippUhr);
  tipp = null;
  tippUhr = setTimeout(() => tippZeigen(false), 5000);
}
function tippZeigen(ansage) {
  if (!B || beschaeftigt || fertig) return;
  tipp = E.besterZug(E.kopie(B), L.ziele, E.zufall(7)) || null;
  if (tipp && ansage) ansagen(`Tipp: ${zellText(tipp[0])} mit ${zellText(tipp[1])} tauschen.`);
}

async function versuchen(a, b) {
  if (beschaeftigt || fertig) return;
  tipp = null;
  clearTimeout(tippUhr);
  if (!E.zugGueltig(B, a, b)) {
    beschaeftigt = true;
    klang.falsch();
    await tauschAnimieren(a, b);
    await tauschAnimieren(a, b);
    beschaeftigt = false;
    ansagen("Dieser Tausch ergibt keine Reihe.");
    tippUhrNeu();
    return;
  }
  beschaeftigt = true;
  zuegeRest--;
  hudAktualisieren();
  const id = laufId;
  const phasen = E.zugAusfuehren(B, a, b, rnd, { bild: true });
  await abspielen(phasen);
  if (id !== laufId) return;
  D = E.momentaufnahme(B);
  cursor = b;
  hudAktualisieren();
  const stand = E.zielStand(B, L.ziele);
  if (stand.erreicht) return geschafft();
  if (zuegeRest <= 0) return verloren();
  beschaeftigt = false;
  tippUhrNeu();
}

/* ============================================================
   Ende eines Levels
   ============================================================ */
async function geschafft() {
  fertig = true;
  const id = laufId;
  klang.sieg();
  if (zuegeRest > 0) {
    banner("Zuckerrausch!", "gross");
    ansagen(`Ziel erreicht! Zuckerrausch: ${zuegeRest} übrige Züge werden zu Bonuspunkten.`);
    await warte(900);
    const rest = zuegeRest;
    const phasen = E.zuckerrausch(B, rest, rnd, { bild: true });
    const proRunde = Math.min(rest, 12);
    for (const ph of phasen) {
      if (id !== laufId) return;
      if (ph.typ === "rausch") {
        zuegeRest = Math.max(0, zuegeRest - Math.min(proRunde, ph.zellen.length));
        hudAktualisieren();
      }
      await abspielen([ph]);
    }
    zuegeRest = 0;
    D = E.momentaufnahme(B);
    hudAktualisieren();
  } else {
    banner("Geschafft!", "gross");
  }
  if (id !== laufId) return;
  const st = E.sterneFuer(B.punkte, L.sterne);
  const alle = bestAlle();
  const vorher = alle[levelId(L)];
  const neuerRekord = !vorher || B.punkte > vorher.p;
  alle[levelId(L)] = { p: Math.max(B.punkte, vorher?.p || 0), st: Math.max(st, vorher?.st || 0) };
  speichere(SPIEL, "best", alle);
  stillEintragen(SPIEL, summePunkte());
  try {
    fsErgebnis = levelGeschafft(SPIEL, {
      sterne: st,
      sterneNeu: Math.max(0, st - (vorher?.st || 0)),
    });
  } catch {
    fsErgebnis = null;
  }
  await warte(700);
  endDialog(true, st, neuerRekord);
}

async function verloren() {
  fertig = true;
  klang.verloren();
  banner("Keine Züge mehr", "klein");
  await warte(900);
  endDialog(false, 0, false);
}

let fsErgebnis = null;
function endDialog(sieg, st, rekord) {
  document.getElementById("spiel-dialog")?.remove();
  const d = document.createElement("dialog");
  d.className = "spiel-dialog zz-dialog";
  d.id = "spiel-dialog";
  const naechstes = LEVELS[LI + 1];
  d.innerHTML = `<h2></h2><p class="gross sterne-gross"></p><p class="info"></p><p class="info klein"></p>
    <div class="aktionen">${sieg && naechstes ? '<button class="knopf primaer" data-r="weiter">Nächstes Level</button>' : ""}
    <button class="knopf${sieg ? "" : " primaer"}" data-r="nochmal">Nochmal</button><button class="knopf" data-r="karte">Levelkarte</button></div>`;
  d.querySelector("h2").textContent = sieg ? "ZUCKERSÜSS!" : "SCHADE!";
  d.querySelector(".gross").textContent = sieg ? sternText(st) : "☆☆☆";
  const stand = E.zielStand(B, L.ziele);
  const fehlt = stand.teile
    .filter((t) => t.ist < t.soll)
    .map(
      (t) =>
        ({
          punkte: `${fmt.format(t.soll - t.ist)} Punkte`,
          gelee: `${t.soll - t.ist} Gelee`,
          kiste: `${t.soll - t.ist} Hindernisse`,
          zutaten: `${t.soll - t.ist} Zutaten`,
        })[t.art],
    );
  d.querySelectorAll(".info")[0].textContent = sieg
    ? `${fmt.format(B.punkte)} Punkte${rekord ? " – neuer Bestwert!" : ""}`
    : `Es fehlten noch ${fehlt.join(" und ")}.`;
  d.querySelectorAll(".info")[1].textContent = sieg
    ? (st < 3 ? `Für ${st + 1} Sterne: ${fmt.format(L.sterne[st])} Punkte.` : "Alle drei Sterne!") +
      ` Gesamt: ${fmt.format(summePunkte())} Punkte.`
    : "Tipp: Vier oder fünf in einer Reihe ergeben Spezial-Bonbons.";
  if (sieg && fsErgebnis) {
    try {
      d.querySelector(".aktionen").before(dialogKasten(fsErgebnis));
    } catch {
      /* egal */
    }
    fsErgebnis = null;
  }
  d.addEventListener("click", (e) => {
    const r = e.target.closest("[data-r]")?.dataset.r;
    if (!r) return;
    d.close();
    if (r === "weiter") levelVorschau(LI + 1);
    else if (r === "nochmal") levelStarten(LI);
    else karteZeigen();
  });
  d.addEventListener("close", () => d.remove());
  document.body.append(d);
  d.showModal();
  ansagen(
    sieg
      ? `Geschafft! ${fmt.format(B.punkte)} Punkte, ${st} von 3 Sternen.`
      : "Level nicht geschafft.",
  );
  toplisteAnzeigen(el.topliste, SPIEL, (p) => fmt.format(p));
}

/* ---------- Knöpfe ---------- */
el.weiter.addEventListener("click", () => levelVorschau(naechstesIndex()));
document.getElementById("zur-karte").addEventListener("click", karteZeigen);
document.getElementById("neustart").addEventListener("click", () => {
  if (beschaeftigt && !fertig) return;
  levelStarten(LI);
});
document.getElementById("tipp").addEventListener("click", () => tippZeigen(true));
document.getElementById("reset").addEventListener("click", () => {
  if (!confirm("Alle Bestwerte und den Fortschritt von Zuckerzauber löschen?")) return;
  spielZuruecksetzen(SPIEL);
  toplisteAnzeigen(el.topliste, SPIEL, (p) => fmt.format(p));
  karteZeigen();
});
tonKnopf(document.getElementById("ton-platz"));
document.addEventListener("visibilitychange", () => {
  zuletzt = performance.now();
});

toplisteAnzeigen(el.topliste, SPIEL, (p) => fmt.format(p));
karteZeigen();
