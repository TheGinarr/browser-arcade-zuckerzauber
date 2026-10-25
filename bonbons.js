/* ============================================================
   ZUCKERZAUBER · bonbons.js – alle Grafiken, selbst gezeichnet (Canvas)
   ------------------------------------------------------------
   Keine Bilddateien: Jede Süßigkeit ist ein Pfad mit Verlauf, Glanzlicht
   und Schatten. Jede Sorte hat eine eigene FORM (Herz, Kreis, Tropfen,
   Würfel, Kristall, Bohne), damit man sie auch ohne Farbsehen erkennt.
   Fertige Bildchen werden pro Größe einmal in ein Offscreen-Canvas
   gemalt und danach nur noch kopiert (schnell, auch auf dem Handy).
   ============================================================ */

export const SORTEN = [
  { name: "Erdbeerherz", hell: "#ff8fa3", farbe: "#ff3b5c", dunkel: "#a3112e" },
  { name: "Orangenlutscher", hell: "#ffc078", farbe: "#ff8a1f", dunkel: "#b04f00" },
  { name: "Zitronentropfen", hell: "#fff59d", farbe: "#ffd60a", dunkel: "#a68a00" },
  { name: "Apfelwürfel", hell: "#b9f6a0", farbe: "#4cc93b", dunkel: "#1f6b16" },
  { name: "Blaubeerkristall", hell: "#9fd3ff", farbe: "#2f8cff", dunkel: "#0b3f8f" },
  { name: "Traubenbohne", hell: "#e2b6ff", farbe: "#a64dff", dunkel: "#55168f" },
];
export const SPEZIAL_NAMEN = [
  "",
  "Streifen waagrecht",
  "Streifen senkrecht",
  "Brausebombe",
  "Regenbogenstern",
];
export const ZUTATEN = ["Haselnuss", "Kirsche"];

const cache = new Map();
let dpr = 1;
export function aufloesung(d) {
  if (d !== dpr) {
    dpr = d;
    cache.clear();
  }
}

function leinwand(g) {
  const c =
    typeof OffscreenCanvas !== "undefined"
      ? new OffscreenCanvas(g * dpr, g * dpr)
      : Object.assign(document.createElement("canvas"), { width: g * dpr, height: g * dpr });
  const x = c.getContext("2d");
  x.scale(dpr, dpr);
  return [c, x];
}

/* ---------- Formen (Einheitsgröße: Mittelpunkt 0,0, Radius ~1) ---------- */
function form(x, sorte) {
  x.beginPath();
  switch (sorte) {
    case 0: // Herz
      x.moveTo(0, 0.92);
      x.bezierCurveTo(-0.35, 0.62, -1, 0.25, -0.96, -0.3);
      x.bezierCurveTo(-0.92, -0.85, -0.25, -1, 0, -0.5);
      x.bezierCurveTo(0.25, -1, 0.92, -0.85, 0.96, -0.3);
      x.bezierCurveTo(1, 0.25, 0.35, 0.62, 0, 0.92);
      break;
    case 1: // Kreis
      x.arc(0, 0, 0.88, 0, Math.PI * 2);
      break;
    case 2: // Tropfen
      x.moveTo(0, -0.98);
      x.bezierCurveTo(0.35, -0.5, 0.86, -0.05, 0.86, 0.32);
      x.bezierCurveTo(0.86, 0.75, 0.45, 0.95, 0, 0.95);
      x.bezierCurveTo(-0.45, 0.95, -0.86, 0.75, -0.86, 0.32);
      x.bezierCurveTo(-0.86, -0.05, -0.35, -0.5, 0, -0.98);
      break;
    case 3: {
      // Würfel (abgerundetes Quadrat)
      const r = 0.28,
        a = 0.8;
      x.moveTo(-a + r, -a);
      x.arcTo(a, -a, a, a, r);
      x.arcTo(a, a, -a, a, r);
      x.arcTo(-a, a, -a, -a, r);
      x.arcTo(-a, -a, a, -a, r);
      break;
    }
    case 4: // Kristall (Sechseck, hochkant)
      for (let k = 0; k < 6; k++) {
        const w = (Math.PI / 3) * k - Math.PI / 2;
        const px = Math.cos(w) * 0.94,
          py = Math.sin(w) * 0.94;
        k ? x.lineTo(px, py) : x.moveTo(px, py);
      }
      break;
    default: // Bohne (schräge Ellipse mit Delle)
      x.ellipse(0, 0, 0.95, 0.66, -0.5, 0, Math.PI * 2);
  }
  x.closePath();
}

function stern(x, r1, r2, zacken = 5, dreh = -Math.PI / 2) {
  x.beginPath();
  for (let k = 0; k < zacken * 2; k++) {
    const r = k % 2 ? r2 : r1;
    const w = dreh + (Math.PI / zacken) * k;
    k ? x.lineTo(Math.cos(w) * r, Math.sin(w) * r) : x.moveTo(Math.cos(w) * r, Math.sin(w) * r);
  }
  x.closePath();
}

/* ---------- Ein Bonbon malen ---------- */
function bonbonMalen(x, g, sorte, spezial) {
  const S = SORTEN[sorte];
  const r = g * 0.4;
  x.save();
  x.translate(g / 2, g / 2);
  // Schlagschatten
  x.save();
  x.translate(0, r * 0.12);
  x.scale(r, r);
  form(x, sorte);
  x.fillStyle = "rgba(0,0,0,0.35)";
  x.filter = "blur(1.5px)";
  x.fill();
  x.restore();
  x.filter = "none";

  // Brausebombe: Sprudel-Hülle um das Bonbon
  if (spezial === 3) {
    const v = x.createRadialGradient(0, 0, r * 0.3, 0, 0, r * 1.25);
    v.addColorStop(0, S.hell + "00");
    v.addColorStop(0.7, S.hell + "66");
    v.addColorStop(1, S.hell + "00");
    x.fillStyle = v;
    x.beginPath();
    x.arc(0, 0, r * 1.25, 0, Math.PI * 2);
    x.fill();
  }

  x.save();
  const k = spezial === 3 ? 0.82 : 1;
  x.scale(r * k, r * k);
  form(x, sorte);
  const v = x.createRadialGradient(-0.35, -0.45, 0.05, 0, 0, 1.15);
  v.addColorStop(0, S.hell);
  v.addColorStop(0.45, S.farbe);
  v.addColorStop(1, S.dunkel);
  x.fillStyle = v;
  x.fill();
  x.lineWidth = 0.07;
  x.strokeStyle = S.dunkel;
  x.stroke();
  x.clip();

  // Sorten-Details
  x.lineWidth = 0.09;
  if (sorte === 0) {
    // Erdbeer-Kerne
    x.fillStyle = "#ffe08a";
    for (const [a, b] of [
      [-0.45, -0.1],
      [0.4, -0.15],
      [-0.1, 0.25],
      [0.25, 0.45],
      [-0.35, 0.45],
      [0.05, -0.2],
    ]) {
      x.beginPath();
      x.ellipse(a, b, 0.05, 0.08, 0.3, 0, Math.PI * 2);
      x.fill();
    }
  } else if (sorte === 1) {
    // Spirale
    x.strokeStyle = "rgba(255,255,255,0.55)";
    x.lineWidth = 0.13;
    x.beginPath();
    for (let t = 0; t < 14; t += 0.1) {
      const rr = 0.06 * t;
      const px = Math.cos(t) * rr,
        py = Math.sin(t) * rr;
      t ? x.lineTo(px, py) : x.moveTo(px, py);
    }
    x.stroke();
  } else if (sorte === 2) {
    // Zitronen-Segmente
    x.strokeStyle = "rgba(255,255,255,0.5)";
    x.beginPath();
    x.arc(0, 0.3, 0.42, 0, Math.PI * 2);
    x.stroke();
    for (let k2 = 0; k2 < 6; k2++) {
      const w = (Math.PI / 3) * k2;
      x.beginPath();
      x.moveTo(0, 0.3);
      x.lineTo(Math.cos(w) * 0.42, 0.3 + Math.sin(w) * 0.42);
      x.stroke();
    }
  } else if (sorte === 3) {
    // Zuckerkristalle
    x.fillStyle = "rgba(255,255,255,0.75)";
    for (const [a, b] of [
      [-0.5, 0.2],
      [0.45, -0.3],
      [0.2, 0.5],
      [-0.15, -0.05],
      [0.55, 0.35],
      [-0.4, -0.5],
    ])
      x.fillRect(a, b, 0.09, 0.09);
  } else if (sorte === 4) {
    // Facetten
    x.strokeStyle = "rgba(255,255,255,0.4)";
    x.lineWidth = 0.06;
    x.beginPath();
    x.moveTo(0, -0.94);
    x.lineTo(0, -0.3);
    x.lineTo(0.81, -0.47);
    x.moveTo(0, -0.3);
    x.lineTo(-0.81, -0.47);
    x.moveTo(0, -0.3);
    x.lineTo(0, 0.4);
    x.lineTo(0.81, 0.47);
    x.moveTo(0, 0.4);
    x.lineTo(-0.81, 0.47);
    x.moveTo(0, 0.4);
    x.lineTo(0, 0.94);
    x.stroke();
  } else {
    // Bohnen-Naht
    x.strokeStyle = "rgba(255,255,255,0.35)";
    x.beginPath();
    x.ellipse(0.05, 0.05, 0.6, 0.3, -0.5, 0.3, 2.6);
    x.stroke();
  }

  // Streifen
  if (spezial === 1 || spezial === 2) {
    x.save();
    if (spezial === 2) x.rotate(Math.PI / 2);
    for (let k2 = -2; k2 <= 2; k2++) {
      x.fillStyle = k2 % 2 ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.0)";
      x.fillRect(-1.2, k2 * 0.3 - 0.08, 2.4, 0.16);
    }
    x.restore();
  }
  // Glanzlicht
  const gl = x.createLinearGradient(0, -0.9, 0, 0);
  gl.addColorStop(0, "rgba(255,255,255,0.85)");
  gl.addColorStop(1, "rgba(255,255,255,0)");
  x.fillStyle = gl;
  x.beginPath();
  x.ellipse(-0.25, -0.5, 0.45, 0.22, -0.5, 0, Math.PI * 2);
  x.fill();
  x.restore();

  if (spezial === 3) {
    // Funkeln rund um die Brausebombe
    x.fillStyle = "#fff";
    for (let k2 = 0; k2 < 6; k2++) {
      const w = (Math.PI / 3) * k2 + 0.3;
      x.save();
      x.translate(Math.cos(w) * r * 1.02, Math.sin(w) * r * 1.02);
      x.scale(r * 0.14, r * 0.14);
      stern(x, 1, 0.35, 4, 0);
      x.fill();
      x.restore();
    }
    x.strokeStyle = "rgba(255,255,255,0.8)";
    x.lineWidth = Math.max(1, g * 0.025);
    x.setLineDash([g * 0.05, g * 0.04]);
    x.beginPath();
    x.arc(0, 0, r * 0.98, 0, Math.PI * 2);
    x.stroke();
  }
  x.restore();
}

/* ---------- Regenbogenstern ---------- */
function sternMalen(x, g) {
  const r = g * 0.44;
  x.save();
  x.translate(g / 2, g / 2);
  x.save();
  x.translate(0, r * 0.1);
  x.scale(r, r);
  stern(x, 1, 0.48);
  x.fillStyle = "rgba(0,0,0,0.35)";
  x.fill();
  x.restore();
  x.scale(r, r);
  stern(x, 1, 0.48);
  let v;
  if (x.createConicGradient) {
    v = x.createConicGradient(0, 0, 0);
    ["#ff3b5c", "#ff8a1f", "#ffd60a", "#4cc93b", "#2f8cff", "#a64dff", "#ff3b5c"].forEach((f, i) =>
      v.addColorStop(i / 6, f),
    );
  } else {
    v = x.createLinearGradient(-1, -1, 1, 1);
    ["#ff3b5c", "#ffd60a", "#4cc93b", "#2f8cff", "#a64dff"].forEach((f, i) =>
      v.addColorStop(i / 4, f),
    );
  }
  x.fillStyle = v;
  x.fill();
  x.lineWidth = 0.08;
  x.strokeStyle = "#fff";
  x.stroke();
  const m = x.createRadialGradient(-0.1, -0.15, 0, 0, 0, 0.5);
  m.addColorStop(0, "#ffffff");
  m.addColorStop(1, "rgba(255,255,255,0)");
  x.fillStyle = m;
  x.beginPath();
  x.arc(0, 0, 0.5, 0, Math.PI * 2);
  x.fill();
  x.restore();
}

/* ---------- Zutaten ---------- */
function zutatMalen(x, g, art) {
  const r = g * 0.4;
  x.save();
  x.translate(g / 2, g / 2);
  x.scale(r, r);
  if (art === 0) {
    // Haselnuss
    x.fillStyle = "rgba(0,0,0,0.3)";
    x.beginPath();
    x.ellipse(0, 0.25, 0.75, 0.72, 0, 0, Math.PI * 2);
    x.fill();
    const v = x.createRadialGradient(-0.3, -0.1, 0.05, 0, 0.2, 1);
    v.addColorStop(0, "#e0a56a");
    v.addColorStop(0.6, "#a8642c");
    v.addColorStop(1, "#5e3412");
    x.fillStyle = v;
    x.beginPath();
    x.moveTo(0, 0.95);
    x.bezierCurveTo(-0.95, 0.85, -0.85, -0.25, -0.62, -0.3);
    x.lineTo(0.62, -0.3);
    x.bezierCurveTo(0.85, -0.25, 0.95, 0.85, 0, 0.95);
    x.fill();
    x.strokeStyle = "#5e3412";
    x.lineWidth = 0.06;
    x.stroke();
    // Hütchen
    const h = x.createLinearGradient(0, -0.9, 0, -0.2);
    h.addColorStop(0, "#8a5a2b");
    h.addColorStop(1, "#5a3815");
    x.fillStyle = h;
    x.beginPath();
    x.moveTo(-0.75, -0.25);
    x.quadraticCurveTo(-0.7, -0.85, 0, -0.85);
    x.quadraticCurveTo(0.7, -0.85, 0.75, -0.25);
    x.closePath();
    x.fill();
    x.strokeStyle = "#3a230b";
    x.stroke();
    x.strokeStyle = "rgba(255,255,255,0.18)";
    for (let k = -2; k <= 2; k++) {
      x.beginPath();
      x.moveTo(k * 0.25, -0.8);
      x.lineTo(k * 0.3, -0.3);
      x.stroke();
    }
    x.fillStyle = "#5a3815";
    x.fillRect(-0.05, -1.05, 0.1, 0.22);
    x.fillStyle = "rgba(255,255,255,0.35)";
    x.beginPath();
    x.ellipse(-0.35, 0.15, 0.12, 0.25, 0.3, 0, Math.PI * 2);
    x.fill();
  } else {
    // Kirschen-Paar
    x.strokeStyle = "#3f7d20";
    x.lineWidth = 0.1;
    x.lineCap = "round";
    x.beginPath();
    x.moveTo(-0.45, 0.2);
    x.quadraticCurveTo(-0.2, -0.6, 0.15, -0.95);
    x.moveTo(0.45, 0.3);
    x.quadraticCurveTo(0.35, -0.4, 0.15, -0.95);
    x.stroke();
    x.fillStyle = "#5fb33a";
    x.beginPath();
    x.ellipse(0.42, -0.85, 0.3, 0.13, -0.4, 0, Math.PI * 2);
    x.fill();
    for (const [cx, cy] of [
      [-0.45, 0.42],
      [0.45, 0.5],
    ]) {
      const v = x.createRadialGradient(cx - 0.15, cy - 0.15, 0.03, cx, cy, 0.5);
      v.addColorStop(0, "#ff8a9a");
      v.addColorStop(0.5, "#d6102f");
      v.addColorStop(1, "#6b0014");
      x.fillStyle = v;
      x.beginPath();
      x.arc(cx, cy, 0.45, 0, Math.PI * 2);
      x.fill();
      x.fillStyle = "rgba(255,255,255,0.7)";
      x.beginPath();
      x.ellipse(cx - 0.17, cy - 0.17, 0.1, 0.06, -0.6, 0, Math.PI * 2);
      x.fill();
    }
  }
  x.restore();
}

/* ---------- Hindernisse ---------- */
function keksMalen(x, g) {
  const r = g * 0.44;
  x.save();
  x.translate(g / 2, g / 2);
  x.scale(r, r);
  x.fillStyle = "rgba(0,0,0,0.3)";
  x.beginPath();
  x.arc(0, 0.08, 0.98, 0, Math.PI * 2);
  x.fill();
  const v = x.createRadialGradient(-0.3, -0.3, 0.1, 0, 0, 1);
  v.addColorStop(0, "#f6d28f");
  v.addColorStop(0.7, "#d99b4a");
  v.addColorStop(1, "#9c6224");
  x.fillStyle = v;
  // Gewellter Rand
  x.beginPath();
  for (let k = 0; k <= 48; k++) {
    const w = (Math.PI * 2 * k) / 48;
    const rr = 0.95 + Math.sin(w * 12) * 0.03;
    k ? x.lineTo(Math.cos(w) * rr, Math.sin(w) * rr) : x.moveTo(Math.cos(w) * rr, Math.sin(w) * rr);
  }
  x.fill();
  x.fillStyle = "#4a2a12";
  for (const [a, b, s] of [
    [-0.4, -0.35, 0.13],
    [0.35, -0.4, 0.11],
    [0.05, 0.05, 0.14],
    [-0.45, 0.35, 0.1],
    [0.42, 0.32, 0.13],
    [0, -0.7, 0.08],
    [0.05, 0.62, 0.09],
  ]) {
    x.beginPath();
    x.ellipse(a, b, s, s * 0.8, a, 0, Math.PI * 2);
    x.fill();
  }
  x.restore();
}

function schokoMalen(x, g) {
  const p = g * 0.06;
  const a = g - 2 * p;
  x.save();
  x.translate(p, p);
  x.fillStyle = "rgba(0,0,0,0.35)";
  x.fillRect(1, 3, a, a);
  const v = x.createLinearGradient(0, 0, a, a);
  v.addColorStop(0, "#8a5230");
  v.addColorStop(1, "#3d1e0c");
  x.fillStyle = v;
  x.beginPath();
  x.roundRect ? x.roundRect(0, 0, a, a, a * 0.12) : x.rect(0, 0, a, a);
  x.fill();
  const h = a / 2;
  for (const [i, j] of [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
  ]) {
    const ox = i * h + a * 0.07,
      oy = j * h + a * 0.07,
      s = h - a * 0.14;
    const t = x.createLinearGradient(ox, oy, ox + s, oy + s);
    t.addColorStop(0, "#a8673d");
    t.addColorStop(0.5, "#6b3a1c");
    t.addColorStop(1, "#4a2510");
    x.fillStyle = t;
    x.fillRect(ox, oy, s, s);
    x.fillStyle = "rgba(255,255,255,0.15)";
    x.fillRect(ox, oy, s, s * 0.12);
  }
  x.restore();
}

/* ---------- Zwischenspeicher-Zugriff ---------- */
export function bildVon(art, g) {
  const key = `${art}|${g}`;
  let c = cache.get(key);
  if (c) return c;
  const [cv, x] = leinwand(g);
  const [typ, a, b] = art.split(":");
  if (typ === "b") bonbonMalen(x, g, Number(a), Number(b));
  else if (typ === "stern") sternMalen(x, g);
  else if (typ === "zutat") zutatMalen(x, g, Number(a));
  else if (typ === "keks") keksMalen(x, g);
  else if (typ === "schoko") schokoMalen(x, g);
  cache.set(key, cv);
  return cv;
}

/** Schlüssel für eine Zelle (Sorte f, Spezial s). */
export function artVon(f, s, zutatArt = 0) {
  if (f === 8) return "stern";
  if (f === 9) return `zutat:${zutatArt}`;
  if (f < 0) return null;
  return `b:${f}:${s}`;
}

/* ---------- Feld-Kacheln, Gelee ---------- */
export function kachelMalen(x, px, py, g, hell, gelee) {
  const r = g * 0.16;
  x.beginPath();
  if (x.roundRect) x.roundRect(px + 1, py + 1, g - 2, g - 2, r);
  else x.rect(px + 1, py + 1, g - 2, g - 2);
  x.fillStyle = hell ? "rgba(255,255,255,0.13)" : "rgba(255,255,255,0.07)";
  x.fill();
  if (!gelee) return;
  const zwei = gelee === 2;
  const rr = (o) => {
    x.beginPath();
    if (x.roundRect) x.roundRect(px + o, py + o, g - 2 * o, g - 2 * o, r);
    else x.rect(px + o, py + o, g - 2 * o, g - 2 * o);
  };
  const v = x.createLinearGradient(px, py, px, py + g);
  if (!zwei) {
    v.addColorStop(0, "rgba(120,240,255,0.92)");
    v.addColorStop(1, "rgba(20,175,215,0.92)");
  } else {
    v.addColorStop(0, "rgba(70,120,255,0.97)");
    v.addColorStop(1, "rgba(25,40,170,0.97)");
  }
  rr(2);
  x.fillStyle = v;
  x.fill();
  x.strokeStyle = zwei ? "#0b1560" : "#05607a";
  x.lineWidth = Math.max(2, g * 0.05);
  x.stroke();
  // Doppel-Gelee: zweiter, heller Innenrand
  if (zwei) {
    rr(g * 0.14);
    x.strokeStyle = "rgba(200,220,255,0.9)";
    x.lineWidth = Math.max(1.5, g * 0.035);
    x.stroke();
  }
  // Glanz + Bläschen (wabbelige Optik, auch ohne Farbsehen erkennbar)
  x.fillStyle = "rgba(255,255,255,0.55)";
  x.beginPath();
  x.ellipse(px + g * 0.3, py + g * 0.2, g * 0.17, g * 0.06, -0.3, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = "rgba(255,255,255,0.45)";
  for (const [a, c, s] of [
    [0.78, 0.72, 0.05],
    [0.2, 0.8, 0.04],
    [0.82, 0.25, 0.035],
  ]) {
    x.beginPath();
    x.arc(px + g * a, py + g * c, g * s, 0, Math.PI * 2);
    x.fill();
  }
}

/** Kleines Symbol für das Ziel-Feld im HUD (als Daten-URL für <img>). */
export function zielSymbol(art, g = 40) {
  const c = document.createElement("canvas");
  const d = window.devicePixelRatio || 1;
  c.width = c.height = g * d;
  const x = c.getContext("2d");
  x.scale(d, d);
  if (art === "gelee") kachelMalen(x, 0, 0, g, false, 1);
  else if (art === "kiste") keksMalen(x, g);
  else if (art === "zutaten") zutatMalen(x, g, 0);
  else sternMalen(x, g);
  return c.toDataURL();
}

/* ---------- Partikel und Effekte ---------- */
export function partikelNeu(liste, cx, cy, farbe, anzahl, g) {
  for (let k = 0; k < anzahl; k++) {
    const w = Math.random() * Math.PI * 2;
    const v = (0.6 + Math.random()) * g * 2.2;
    liste.push({
      x: cx,
      y: cy,
      vx: Math.cos(w) * v,
      vy: Math.sin(w) * v - g,
      t: 0,
      dauer: 0.45 + Math.random() * 0.3,
      farbe,
      r: g * (0.05 + Math.random() * 0.06),
      stern: Math.random() < 0.3,
    });
  }
}

export function partikelMalen(x, liste, dt, g) {
  for (let i = liste.length - 1; i >= 0; i--) {
    const p = liste[i];
    p.t += dt;
    if (p.t >= p.dauer) {
      liste.splice(i, 1);
      continue;
    }
    p.vy += g * 9 * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    const a = 1 - p.t / p.dauer;
    x.globalAlpha = a;
    x.fillStyle = p.farbe;
    x.beginPath();
    if (p.stern) {
      x.save();
      x.translate(p.x, p.y);
      x.scale(p.r * 1.8, p.r * 1.8);
      stern(x, 1, 0.4, 4, p.t * 6);
      x.restore();
    } else x.arc(p.x, p.y, p.r * a + 0.5, 0, Math.PI * 2);
    x.fill();
  }
  x.globalAlpha = 1;
}

export const FARBE_HELL = SORTEN.map((s) => s.hell);
