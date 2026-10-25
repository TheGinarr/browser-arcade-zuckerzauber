/* ============================================================
   ZUCKERZAUBER · engine.js – Regeln eines Match-3-Spiels (ohne DOM)
   ------------------------------------------------------------
   Das Brett ist eine flache Liste von Zellen (Index = zeile * breite + spalte).
   Pro Zelle gibt es parallele Typed Arrays:
     m  1 = Zelle existiert (Masken-Form), 0 = Loch
     f  Sorte: -1 leer, 0..5 Bonbon-Farbe, 8 Regenbogenstern, 9 Zutat
     s  Spezial: 0 keins, 1 Streifen waagrecht, 2 Streifen senkrecht,
        3 Brausebombe, 4 Regenbogenstern
     g  Gelee-Schichten unter dem Bonbon (0..2)
     x  Hindernis (Keks 1 Treffer, Schokoblock 2 Treffer) – belegt die Zelle
   Ein Zug läuft in PHASEN ab (für die Animation):
     tausch → weg (Treffer + ausgelöste Spezialsteine) → fall (nachrutschen,
     Neues fällt von oben) → weg → fall … → evtl. mischen.
   Die gleichen Funktionen benutzt der Bot (bot.mjs), der jedes Level
   hunderte Male durchspielt, um Zugzahl und Sterne festzulegen.
   ============================================================ */

export const LEER = -1;
export const STERN_F = 8;
export const ZUTAT = 9;
export const S_H = 1;
export const S_V = 2;
export const S_BOMBE = 3;
export const S_STERN = 4;

/* ---------- Zufall mit Startwert ---------- */
export function zufall(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ============================================================
   Brett anlegen
   level.feld: Zeilen-Strings, je Zeichen eine Zelle:
     ' ' Loch   '.' normal   'g'/'G' Gelee 1/2   'k'/'K' Keks/Schokoblock
   ============================================================ */
export function brettNeu(level, rnd) {
  const h = level.feld.length;
  const w = level.feld[0].length;
  const N = h * w;
  const B = {
    h,
    w,
    N,
    n: level.farben,
    m: new Uint8Array(N),
    f: new Int8Array(N).fill(LEER),
    s: new Uint8Array(N),
    g: new Uint8Array(N),
    x: new Uint8Array(N),
    zRest: level.ziele?.zutaten ?? 0,
    zMax: Math.min(2, level.ziele?.zutaten ?? 0),
    punkte: 0,
    stat: { gelee: 0, kiste: 0, zutaten: 0, sterne: 0 },
    geleeStart: 0,
    kisteStart: 0,
  };
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      const z = level.feld[r][c];
      const i = r * w + c;
      if (z === " ") continue;
      B.m[i] = 1;
      if (z === "g") B.g[i] = 1;
      if (z === "G") B.g[i] = 2;
      if (z === "k") B.x[i] = 1;
      if (z === "K") B.x[i] = 2;
      B.geleeStart += B.g[i];
      if (B.x[i]) B.kisteStart++;
    }
  }
  for (let i = 0; i < N; i++) if (B.m[i] && !B.x[i]) B.f[i] = startFarbe(B, i, rnd);
  // Zutaten oben einsetzen
  for (let k = 0; k < B.zMax; k++) {
    const oben = [];
    for (let c = 0; c < w; c++) {
      const i = obersteZelle(B, c);
      if (i >= 0 && B.f[i] !== ZUTAT) oben.push(i);
    }
    if (!oben.length) break;
    const i = oben[Math.floor(rnd() * oben.length)];
    B.f[i] = ZUTAT;
    B.zRest--;
  }
  if (!hatZug(B)) mischen(B, rnd);
  return B;
}

function startFarbe(B, i, rnd) {
  const { w } = B;
  const r = Math.floor(i / w);
  const c = i % w;
  for (let v = 0; v < 30; v++) {
    const f = Math.floor(rnd() * B.n);
    const links = c >= 2 && gleich(B, i - 1, f) && gleich(B, i - 2, f);
    const oben = r >= 2 && gleich(B, i - w, f) && gleich(B, i - 2 * w, f);
    if (!links && !oben) return f;
  }
  return Math.floor(rnd() * B.n);
}
const gleich = (B, i, f) => B.m[i] && !B.x[i] && B.f[i] === f;

function obersteZelle(B, c) {
  for (let r = 0; r < B.h; r++) {
    const i = r * B.w + c;
    if (B.m[i]) return B.x[i] ? -1 : i;
  }
  return -1;
}

export function kopie(B) {
  return {
    ...B,
    m: B.m,
    f: B.f.slice(),
    s: B.s.slice(),
    g: B.g.slice(),
    x: B.x.slice(),
    stat: { ...B.stat },
  };
}

/* ============================================================
   Züge
   ============================================================ */
const farbig = (B, i) => B.f[i] >= 0 && B.f[i] < 6;
const beweglich = (B, i) => B.m[i] && !B.x[i] && B.f[i] !== LEER;

export function nachbarn(B, a, b) {
  const ra = Math.floor(a / B.w),
    rb = Math.floor(b / B.w);
  return (Math.abs(a - b) === 1 && ra === rb) || Math.abs(a - b) === B.w;
}

/** Bildet die Zelle i (mit ihrer Farbe) eine Dreierreihe? */
function inReihe(B, i) {
  if (!farbig(B, i)) return false;
  const f = B.f[i];
  const { w } = B;
  const c = i % w;
  let n = 1;
  for (let k = c - 1; k >= 0 && gleich(B, i - (c - k), f); k--) n++;
  for (let k = c + 1; k < w && gleich(B, i + (k - c), f); k++) n++;
  if (n >= 3) return true;
  n = 1;
  for (let j = i - w; j >= 0 && gleich(B, j, f); j -= w) n++;
  for (let j = i + w; j < B.N && gleich(B, j, f); j += w) n++;
  return n >= 3;
}

export function zugGueltig(B, a, b) {
  if (!nachbarn(B, a, b) || !beweglich(B, a) || !beweglich(B, b)) return false;
  const sa = B.s[a],
    sb = B.s[b];
  if (sa === S_STERN || sb === S_STERN) return B.f[a] !== ZUTAT && B.f[b] !== ZUTAT;
  if (sa && sb) return true;
  tauschen(B, a, b);
  const ok = inReihe(B, a) || inReihe(B, b);
  tauschen(B, a, b);
  return ok;
}

function tauschen(B, a, b) {
  const f = B.f[a];
  B.f[a] = B.f[b];
  B.f[b] = f;
  const s = B.s[a];
  B.s[a] = B.s[b];
  B.s[b] = s;
}

export function alleZuege(B) {
  const z = [];
  for (let i = 0; i < B.N; i++) {
    if (!B.m[i]) continue;
    if ((i % B.w) + 1 < B.w && zugGueltig(B, i, i + 1)) z.push([i, i + 1]);
    if (i + B.w < B.N && zugGueltig(B, i, i + B.w)) z.push([i, i + B.w]);
  }
  return z;
}

export function hatZug(B) {
  for (let i = 0; i < B.N; i++) {
    if (!B.m[i]) continue;
    if ((i % B.w) + 1 < B.w && zugGueltig(B, i, i + 1)) return true;
    if (i + B.w < B.N && zugGueltig(B, i, i + B.w)) return true;
  }
  return false;
}

/* ============================================================
   Einen Zug komplett ausführen → Liste von Phasen
   opt.bild = true: jede Phase bekommt eine Momentaufnahme (für die UI)
   ============================================================ */
export function zugAusfuehren(B, a, b, rnd, opt = {}) {
  const phasen = [];
  tauschen(B, a, b);
  phasen.push({ typ: "tausch", a, b });
  const mark = new Uint8Array(B.N);
  const sa = B.s[b],
    sb = B.s[a]; // nach dem Tausch: a trägt jetzt den Stein von b
  let kombi = false;
  if (sa === S_STERN || sb === S_STERN || (sa && sb)) {
    kombi = true;
    kombination(B, a, b, mark, phasen);
  }
  let kaskade = 0;
  if (kombi) {
    phasen.push(loeschen(B, mark, null, kaskade, rnd, opt, phasen.kombiEffekte || []));
    fallen(B, rnd, phasen, opt);
    kaskade++;
  }
  kaskadeLaufen(B, rnd, phasen, opt, kaskade, kombi ? null : [a, b]);
  return phasen;
}

function kaskadeLaufen(B, rnd, phasen, opt, kaskade = 0, tausch = null) {
  for (;;) {
    const t = treffer(B, rnd, kaskade, tausch, opt);
    if (!t) break;
    phasen.push(t);
    fallen(B, rnd, phasen, opt);
    kaskade++;
    tausch = null;
    if (kaskade > 60) break; // Schutz
  }
  if (!hatZug(B)) {
    mischen(B, rnd);
    phasen.push({ typ: "mischen", bild: opt.bild ? bild(B) : null });
  }
}

/* ---------- Kombinationen beim Tausch zweier Spezialsteine ---------- */
function kombination(B, a, b, mark, phasen) {
  // Stein, der jetzt auf b liegt, kam von a (aktiv bewegt)
  const sA = B.s[b],
    sB = B.s[a];
  const eff = [];
  const fertig = (i) => {
    mark[i] = 2;
    B.s[i] = 0;
  };
  if (sA === S_STERN && sB === S_STERN) {
    for (let i = 0; i < B.N; i++) if (B.m[i]) mark[i] = 2;
    B.s[a] = B.s[b] = 0;
    eff.push({ typ: "alles", i: b });
  } else if (sA === S_STERN || sB === S_STERN) {
    const stern = sA === S_STERN ? b : a;
    const ander = stern === a ? b : a;
    const farbe = B.f[ander];
    const sp = B.s[ander];
    fertig(stern);
    eff.push({ typ: "stern", i: stern, farbe });
    for (let i = 0; i < B.N; i++) {
      if (!B.m[i] || B.x[i] || B.f[i] !== farbe) continue;
      if (sp === S_H || sp === S_V) B.s[i] = (i * 7 + farbe) % 2 ? S_H : S_V;
      else if (sp === S_BOMBE) B.s[i] = S_BOMBE;
      mark[i] = 2;
    }
  } else {
    const streifen = (s) => s === S_H || s === S_V;
    fertig(a);
    fertig(b);
    const r = Math.floor(b / B.w),
      c = b % B.w;
    if (streifen(sA) && streifen(sB)) {
      zeileMarken(B, r, mark);
      spalteMarken(B, c, mark);
      eff.push({ typ: "kreuz", i: b, breite: 1 });
    } else if (sA === S_BOMBE && sB === S_BOMBE) {
      flaecheMarken(B, b, 2, mark);
      eff.push({ typ: "bombe", i: b, radius: 2 });
    } else {
      for (let d = -1; d <= 1; d++) {
        if (r + d >= 0 && r + d < B.h) zeileMarken(B, r + d, mark);
        if (c + d >= 0 && c + d < B.w) spalteMarken(B, c + d, mark);
      }
      eff.push({ typ: "kreuz", i: b, breite: 3 });
    }
  }
  phasen.kombiEffekte = eff;
}

function zeileMarken(B, r, mark) {
  for (let c = 0; c < B.w; c++) {
    const i = r * B.w + c;
    if (B.m[i]) mark[i] = mark[i] || 2;
  }
}
function spalteMarken(B, c, mark) {
  for (let r = 0; r < B.h; r++) {
    const i = r * B.w + c;
    if (B.m[i]) mark[i] = mark[i] || 2;
  }
}
function flaecheMarken(B, i, rad, mark) {
  const r0 = Math.floor(i / B.w),
    c0 = i % B.w;
  for (let r = r0 - rad; r <= r0 + rad; r++) {
    for (let c = c0 - rad; c <= c0 + rad; c++) {
      if (r < 0 || c < 0 || r >= B.h || c >= B.w) continue;
      const j = r * B.w + c;
      if (B.m[j]) mark[j] = mark[j] || 2;
    }
  }
}

/* ---------- Treffer suchen, Spezialsteine bestimmen ---------- */
function treffer(B, rnd, kaskade, tausch, opt) {
  const { w, h, N } = B;
  const laeufe = [];
  for (let r = 0; r < h; r++) {
    let c = 0;
    while (c < w) {
      const i = r * w + c;
      if (!farbig(B, i) || B.x[i]) {
        c++;
        continue;
      }
      let e = c + 1;
      while (e < w && gleich(B, r * w + e, B.f[i])) e++;
      if (e - c >= 3)
        laeufe.push({ zellen: Array.from({ length: e - c }, (_, k) => i + k), dir: "h" });
      c = e;
    }
  }
  for (let c = 0; c < w; c++) {
    let r = 0;
    while (r < h) {
      const i = r * w + c;
      if (!farbig(B, i) || B.x[i]) {
        r++;
        continue;
      }
      let e = r + 1;
      while (e < h && gleich(B, e * w + c, B.f[i])) e++;
      if (e - r >= 3)
        laeufe.push({ zellen: Array.from({ length: e - r }, (_, k) => i + k * w), dir: "v" });
      r = e;
    }
  }
  if (!laeufe.length) return null;

  // Läufe, die sich eine Zelle teilen, gehören zu einer Gruppe (L/T-Formen)
  const gruppeVon = new Int16Array(N).fill(-1);
  const gruppen = [];
  for (const l of laeufe) {
    let g = -1;
    for (const i of l.zellen)
      if (gruppeVon[i] >= 0) {
        g = gruppeVon[i];
        break;
      }
    if (g < 0) {
      g = gruppen.length;
      gruppen.push({ laeufe: [], zellen: new Set() });
    }
    gruppen[g].laeufe.push(l);
    for (const i of l.zellen) {
      gruppeVon[i] = g;
      gruppen[g].zellen.add(i);
    }
  }

  const mark = new Uint8Array(N);
  const neu = [];
  for (const gr of gruppen) {
    for (const i of gr.zellen) mark[i] = 1;
    const laengste = gr.laeufe.reduce((a, l) => (l.zellen.length > a.zellen.length ? l : a));
    const hatH = gr.laeufe.some((l) => l.dir === "h"),
      hatV = gr.laeufe.some((l) => l.dir === "v");
    let sp = 0;
    if (laengste.zellen.length >= 5) sp = S_STERN;
    else if (hatH && hatV) sp = S_BOMBE;
    else if (laengste.zellen.length === 4) sp = laengste.dir === "h" ? S_V : S_H;
    if (!sp) continue;
    // Ort: getauschte Zelle, sonst Kreuzungspunkt, sonst Mitte
    let ort = -1;
    const frei = (i) => gr.zellen.has(i) && !B.s[i];
    if (tausch) for (const t of tausch) if (ort < 0 && frei(t)) ort = t;
    if (ort < 0 && sp === S_BOMBE) {
      for (const i of gr.zellen)
        if (ort < 0 && frei(i) && gr.laeufe.filter((l) => l.zellen.includes(i)).length > 1) ort = i;
    }
    if (ort < 0) {
      const mitte = laengste.zellen[Math.floor(laengste.zellen.length / 2)];
      if (frei(mitte)) ort = mitte;
      else for (const i of gr.zellen) if (ort < 0 && frei(i)) ort = i;
    }
    if (ort >= 0) neu.push({ i: ort, f: sp === S_STERN ? STERN_F : B.f[ort], s: sp });
  }
  return loeschen(B, mark, neu, kaskade, rnd, opt, []);
}

/* ---------- Löschen inkl. Kettenreaktion der Spezialsteine ---------- */
function loeschen(B, mark, neu, kaskade, rnd, opt, effekte) {
  const { N, w } = B;
  const neuOrt = new Set((neu || []).map((n) => n.i));
  // Ausgelöste Spezialsteine abarbeiten (Warteschlange)
  const gefeuert = new Uint8Array(N);
  let weiter = true;
  while (weiter) {
    weiter = false;
    for (let i = 0; i < N; i++) {
      if (!mark[i] || gefeuert[i] || !B.s[i] || neuOrt.has(i) || B.x[i]) continue;
      gefeuert[i] = 1;
      weiter = true;
      const r = Math.floor(i / w),
        c = i % w;
      const s = B.s[i];
      if (s === S_H) {
        zeileMarken(B, r, mark);
        effekte.push({ typ: "zeile", i });
      } else if (s === S_V) {
        spalteMarken(B, c, mark);
        effekte.push({ typ: "spalte", i });
      } else if (s === S_BOMBE) {
        flaecheMarken(B, i, 1, mark);
        effekte.push({ typ: "bombe", i, radius: 1 });
      } else if (s === S_STERN) {
        const farbe = haeufigsteFarbe(B);
        for (let j = 0; j < N; j++)
          if (B.m[j] && !B.x[j] && B.f[j] === farbe) mark[j] = mark[j] || 2;
        effekte.push({ typ: "stern", i, farbe });
      }
    }
  }
  const zellen = [];
  let punkte = 0;
  const getroffen = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    if (!mark[i]) continue;
    if (B.x[i]) {
      if (mark[i] === 2 && !getroffen[i]) {
        getroffen[i] = 1;
        punkte += kisteTreffer(B, i, zellen);
      }
      continue;
    }
    if (B.f[i] === LEER || B.f[i] === ZUTAT) continue;
    zellen.push({ i, f: B.f[i], s: B.s[i] });
    if (B.f[i] === STERN_F) B.stat.sterne++;
    B.f[i] = LEER;
    B.s[i] = 0;
    punkte += 60 * (kaskade + 1);
    if (B.g[i]) {
      B.g[i]--;
      B.stat.gelee++;
      punkte += 200;
    }
    // Normale Treffer beschädigen Hindernisse daneben
    if (mark[i] === 1) {
      const r = Math.floor(i / w),
        c = i % w;
      for (const j of [
        c > 0 ? i - 1 : -1,
        c < w - 1 ? i + 1 : -1,
        r > 0 ? i - w : -1,
        r < B.h - 1 ? i + w : -1,
      ]) {
        if (j >= 0 && B.x[j] && !getroffen[j]) {
          getroffen[j] = 1;
          punkte += kisteTreffer(B, j, zellen);
        }
      }
    }
  }
  for (const n of neu || []) {
    B.f[n.i] = n.f;
    B.s[n.i] = n.s;
    punkte += n.s === S_STERN ? 600 : n.s === S_BOMBE ? 300 : 180;
  }
  B.punkte += punkte;
  return {
    typ: "weg",
    zellen,
    neu: neu || [],
    effekte,
    punkte,
    kaskade,
    bild: opt.bild ? bild(B) : null,
  };
}

function kisteTreffer(B, i, zellen) {
  B.x[i]--;
  zellen.push({ i, kiste: B.x[i] + 1 });
  if (!B.x[i]) {
    B.stat.kiste++;
    B.f[i] = LEER;
    return 200;
  }
  return 50;
}

function haeufigsteFarbe(B) {
  const z = new Array(6).fill(0);
  for (let i = 0; i < B.N; i++) if (farbig(B, i) && !B.x[i]) z[B.f[i]]++;
  let best = 0;
  for (let f = 1; f < 6; f++) if (z[f] > z[best]) best = f;
  return best;
}

/* ---------- Nachrutschen + Nachschub ---------- */
function fallen(B, rnd, phasen, opt) {
  const { w, h } = B;
  for (let runde = 0; runde < 10; runde++) {
    const wege = [];
    const neu = [];
    let zutatenDrauf = 0;
    for (let i = 0; i < B.N; i++) if (B.f[i] === ZUTAT) zutatenDrauf++;
    for (let c = 0; c < w; c++) {
      // Spalte von unten nach oben in Abschnitte zwischen Hindernissen teilen
      let abschnitt = [];
      const abschnitte = [];
      for (let r = h - 1; r >= 0; r--) {
        const i = r * w + c;
        if (!B.m[i]) continue;
        if (B.x[i]) {
          abschnitte.push(abschnitt);
          abschnitt = [];
          continue;
        }
        abschnitt.push(i);
      }
      abschnitte.push(abschnitt);
      abschnitte.forEach((ab, nr) => {
        if (!ab.length) return;
        const steine = [];
        for (const i of ab) if (B.f[i] !== LEER) steine.push(i);
        if (steine.length === ab.length) return;
        const fs = steine.map((i) => [B.f[i], B.s[i]]);
        for (const i of ab) {
          B.f[i] = LEER;
          B.s[i] = 0;
        }
        steine.forEach((von, k) => {
          const nach = ab[k];
          B.f[nach] = fs[k][0];
          B.s[nach] = fs[k][1];
          if (von !== nach) wege.push({ von, nach });
        });
        const oberster = nr === abschnitte.length - 1;
        let hoehe = 0;
        for (let k = steine.length; k < ab.length; k++) {
          let f = Math.floor(rnd() * B.n);
          if (oberster && B.zRest > 0 && zutatenDrauf < B.zMax && rnd() < 0.3) {
            f = ZUTAT;
            B.zRest--;
            zutatenDrauf++;
          }
          B.f[ab[k]] = f;
          B.s[ab[k]] = 0;
          neu.push({ nach: ab[k], hoehe: ++hoehe });
        }
      });
    }
    // Zutaten, die unten angekommen sind, verlassen das Brett
    const raus = [];
    for (let c = 0; c < w; c++) {
      for (let r = h - 1; r >= 0; r--) {
        const i = r * w + c;
        if (!B.m[i]) continue;
        if (!B.x[i] && B.f[i] === ZUTAT) {
          raus.push(i);
          B.f[i] = LEER;
          B.stat.zutaten++;
          B.punkte += 5000;
        }
        break;
      }
    }
    if (wege.length || neu.length || raus.length) {
      phasen.push({ typ: "fall", wege, neu, raus, bild: opt.bild ? bild(B) : null });
    }
    if (!raus.length) break;
  }
}

/* ---------- Mischen, wenn nichts mehr geht ---------- */
export function mischen(B, rnd) {
  const orte = [];
  for (let i = 0; i < B.N; i++) if (B.m[i] && !B.x[i] && farbig(B, i) && !B.s[i]) orte.push(i);
  const farben = orte.map((i) => B.f[i]);
  for (let v = 0; v < 200; v++) {
    for (let k = farben.length - 1; k > 0; k--) {
      const j = Math.floor(rnd() * (k + 1));
      [farben[k], farben[j]] = [farben[j], farben[k]];
    }
    orte.forEach((i, k) => (B.f[i] = farben[k]));
    if (v > 150) for (const i of orte) B.f[i] = startFarbe(B, i, rnd);
    if (!orte.some((i) => inReihe(B, i)) && hatZug(B)) return true;
  }
  return false;
}

/* ---------- Momentaufnahme für die Animation ---------- */
function bild(B) {
  return { f: B.f.slice(), s: B.s.slice(), g: B.g.slice(), x: B.x.slice(), punkte: B.punkte };
}
export const momentaufnahme = bild;

/* ============================================================
   Ziele, Sterne, Zuckerrausch
   ============================================================ */
export function zielStand(B, ziele) {
  const teile = [];
  if (ziele.punkte) teile.push({ art: "punkte", ist: B.punkte, soll: ziele.punkte });
  if (ziele.gelee) teile.push({ art: "gelee", ist: B.stat.gelee, soll: B.geleeStart });
  if (ziele.kiste) teile.push({ art: "kiste", ist: B.stat.kiste, soll: B.kisteStart });
  if (ziele.zutaten) teile.push({ art: "zutaten", ist: B.stat.zutaten, soll: ziele.zutaten });
  return { teile, erreicht: teile.every((t) => t.ist >= t.soll) };
}

/**
 * Zuckerrausch: Übrige Züge werden zu Streifen-Bonbons, die alle zünden.
 * Bringt Extrapunkte (für die Sterne), ändert sonst nichts mehr.
 */
export function zuckerrausch(B, rest, rnd, opt = {}) {
  const phasen = [];
  for (let runde = 0; runde < 3 && rest > 0; runde++) {
    const kandidaten = [];
    for (let i = 0; i < B.N; i++) if (farbig(B, i) && !B.s[i] && !B.x[i]) kandidaten.push(i);
    const mark = new Uint8Array(B.N);
    const neuStreifen = [];
    const anzahl = Math.min(rest, kandidaten.length, 12);
    for (let k = 0; k < anzahl; k++) {
      const j = k + Math.floor(rnd() * (kandidaten.length - k));
      [kandidaten[k], kandidaten[j]] = [kandidaten[j], kandidaten[k]];
      const i = kandidaten[k];
      B.s[i] = rnd() < 0.5 ? S_H : S_V;
      neuStreifen.push(i);
    }
    rest -= anzahl;
    B.punkte += anzahl * 300;
    phasen.push({ typ: "rausch", zellen: neuStreifen, bild: opt.bild ? bild(B) : null });
    for (let i = 0; i < B.N; i++) if (B.s[i] && B.s[i] !== S_STERN) mark[i] = 2;
    phasen.push(loeschen(B, mark, null, 1, rnd, opt, []));
    fallen(B, rnd, phasen, opt);
    kaskadeLaufen(B, rnd, phasen, opt, 2);
  }
  B.punkte += rest * 300;
  return phasen;
}

export function sterneFuer(punkte, schwellen) {
  return punkte >= schwellen[2] ? 3 : punkte >= schwellen[1] ? 2 : 1;
}

/* ============================================================
   Bewertung eines Zuges (Bot + Tipp-Funktion)
   Gierig: spielt den Zug auf einer Kopie und misst den Fortschritt.
   ============================================================ */
export function zugWert(B, zug, ziele, rnd) {
  const K = kopie(B);
  const vorher = zutatHoehe(K);
  zugAusfuehren(K, zug[0], zug[1], rnd);
  let wert = (K.punkte - B.punkte) * (ziele.punkte ? 1 : 0.15);
  if (ziele.gelee) wert += (K.stat.gelee - B.stat.gelee) * 400;
  if (ziele.kiste) wert += (K.stat.kiste - B.stat.kiste) * 350;
  if (ziele.zutaten)
    wert += (K.stat.zutaten - B.stat.zutaten) * 4000 + (zutatHoehe(K) - vorher) * 500;
  return wert;
}

function zutatHoehe(B) {
  let s = 0;
  for (let i = 0; i < B.N; i++) if (B.f[i] === ZUTAT) s += Math.floor(i / B.w);
  return s;
}

export function besterZug(B, ziele, rnd) {
  let best = null;
  let bestWert = -Infinity;
  for (const z of alleZuege(B)) {
    const w = zugWert(B, z, ziele, rnd) + rnd() * 30;
    if (w > bestWert) {
      bestWert = w;
      best = z;
    }
  }
  return best;
}
