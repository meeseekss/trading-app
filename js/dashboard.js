// Darstellung, Diagramme und Tabs. Die App bekommt die Daten über zeigen() aus Supabase.
// data/dashboard.html des Bots nutzt denselben Code, tools/vorlage.mjs baut daraus dashboard_template.html.

let DATA = null;

const $ = id => document.getElementById(id);
const eur = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });
const eur0 = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const usd = new Intl.NumberFormat("de-DE", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 3 });
const pct = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const stueck = new Intl.NumberFormat("de-DE", { maximumSignificantDigits: 6 });
const eurKlein = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumSignificantDigits: 4 });
const kursEur = n => (n >= 1 ? eur : eurKlein).format(n); // Pepe kostet Bruchteile eines Cents
const dShort = new Intl.DateTimeFormat("de-DE", { day: "numeric", month: "short" });
const dLong = new Intl.DateTimeFormat("de-DE", { weekday: "short", day: "numeric", month: "long", year: "numeric" });
const dTime = new Intl.DateTimeFormat("de-DE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const toDate = s => new Date(s);
const signed = (n, f = eur) => (n > 0 ? "+" : n < 0 ? "−" : "±") + f.format(Math.abs(n));
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const cssVar = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const NS = "http://www.w3.org/2000/svg";
const svgEl = (tag, attrs = {}, parent) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (parent) parent.appendChild(e);
  return e;
};
function arrow(n) { return n > 0 ? "▲ " : n < 0 ? "▼ " : ""; }
function dirClass(n) { return n > 0 ? "up" : n < 0 ? "down" : ""; }

let range = 0, unit = "pct", showAllTrades = false;
try { range = Number(localStorage.getItem("tb-range") ?? 0); } catch (e) {}
try { unit = localStorage.getItem("tb-unit") || "pct"; } catch (e) {}
try { const th = localStorage.getItem("tb-theme"); if (th) document.documentElement.dataset.theme = th; } catch (e) {}

const BOT = { key: "v", name: "Bot", color: "--s-bot", width: 2.5 };
const SPARPLAN = { key: "b", name: "Sparplan", color: "--s-etf", width: 2.5 };
const TIERS = {
  core: { n: "Krypto Basis", tag: "Basis", c: "--s-core" },
  alt: { n: "Krypto Altcoins", tag: "Altcoin", c: "--s-alt" },
  risk: { n: "Krypto Risiko", tag: "Risiko", c: "--s-risk" },
};
const tagFor = p => p.cls === "etf" ? "ETF" : TIERS[p.tier]?.tag ?? "Krypto";
const tagHtml = p => `<span class="tag${p.tier === "risk" ? " risk" : ""}">${tagFor(p)}</span>`;
const rendite = (wert, ein) => ein ? (wert / ein - 1) * 100 : 0;
const pctS = n => signed(n, pct).replace("€", "");

/* ---------- Tooltip ---------- */
const tip = $("tip");
function showTip(html, x, y) {
  tip.innerHTML = html; tip.classList.add("show");
  const w = tip.offsetWidth, h = tip.offsetHeight, pad = 14;
  let left = x + pad, top = y - h - pad;
  if (left + w > innerWidth - 8) left = x - w - pad;
  if (top < 8) top = y + pad;
  tip.style.left = Math.max(8, left) + "px"; tip.style.top = top + "px";
}
function hideTip() { tip.classList.remove("show"); }

/* ---------- Skalen ---------- */
function niceTicks(min, max, count = 4) {
  if (min === max) { min -= 1; max += 1; }
  const span = max - min, step0 = span / count, mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => span / s <= count) || 10 * mag;
  const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step, ticks = [];
  for (let t = lo; t <= hi + step / 2; t += step) ticks.push(+t.toFixed(10));
  return { lo, hi, ticks };
}
function filtered() {
  const runs = DATA.runs;
  if (!range || !runs.length) return runs;
  const last = toDate(runs[runs.length - 1].t).getTime();
  return runs.filter(r => toDate(r.t).getTime() >= last - range * 864e5);
}

/* ---------- Liniendiagramm ---------- */
function lineChart({ id, series: wanted, P = false, legend, hint, table, aria }) {
  const el = $(id); el.innerHTML = "";
  const runs = filtered();
  const series = wanted.filter(s => runs.some(r => r[s.key] != null));
  const val = (r, k) => r[k] == null ? null : P ? (r.d ? (r[k] / r.d - 1) * 100 : null) : r[k];
  const fmtY = v => P ? signed(v, pct).replace("±", "") + " %" : eur0.format(v);
  if (hint) $(hint).textContent = P ? "Gewinn oder Verlust in Prozent der Einzahlungen" : "Wert in Euro, inklusive aller Einzahlungen";
  if (legend) $(legend).innerHTML = series.map(s =>
    `<span><i class="swatch line" style="background:var(${s.color})"></i>${s.name}</span>`).join("")
    + (P ? "" : `<span><i class="swatch dash"></i>Eingezahlt</span>`);
  if (runs.length < 2) { el.innerHTML = `<div class="empty">${runs.length ? "Nach dem zweiten Lauf erscheint hier die Kurve." : "Noch keine Läufe. Der erste läuft werktags um 10:15."}</div>`; return; }

  const W = el.clientWidth, H = W < 600 ? 230 : 300;
  const m = { t: 12, r: W < 600 || wanted.length < 2 ? 12 : 84, b: 28, l: 52 };
  const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, height: H, role: "img", "aria-label": aria }, el);
  const xs = runs.map(r => toDate(r.t).getTime());
  const x0 = xs[0], x1 = xs[xs.length - 1];
  const vals = runs.flatMap(r => [...series.map(s => val(r, s.key)), P ? 0 : r.d]).filter(v => v != null);
  const { lo, hi, ticks } = niceTicks(Math.min(...vals), Math.max(...vals));
  const X = t => m.l + (t - x0) / (x1 - x0 || 1) * (W - m.l - m.r);
  const Y = v => m.t + (1 - (v - lo) / (hi - lo || 1)) * (H - m.t - m.b);

  for (const t of ticks) {
    svgEl("line", { x1: m.l, x2: W - m.r, y1: Y(t), y2: Y(t), class: P && t === 0 ? "zero" : "gridline" }, svg);
    svgEl("text", { x: m.l - 8, y: Y(t) + 4, "text-anchor": "end" }, svg).textContent = fmtY(t);
  }
  const nX = Math.max(2, Math.min(6, Math.floor((W - m.l - m.r) / 110)));
  for (let i = 0; i < nX; i++) {
    const t = x0 + (x1 - x0) * i / (nX - 1);
    svgEl("text", { x: X(t), y: H - 8, "text-anchor": i === 0 ? "start" : i === nX - 1 ? "end" : "middle" }, svg)
      .textContent = dShort.format(new Date(t));
  }
  // Einzahlungen als gestrichelte Treppe
  if (!P) {
    let dp = "";
    runs.forEach((r, i) => { if (r.d == null) return; const x = X(xs[i]), y = Y(r.d);
      dp += dp ? `H${x}V${y}` : `M${x},${y}`; });
    svgEl("path", { d: dp, fill: "none", stroke: cssVar("--text-3"), "stroke-width": 1.5, "stroke-dasharray": "4 4" }, svg);
  }

  const ends = [];
  for (const s of [...series].reverse()) {
    let d = "", started = false;
    runs.forEach((r, i) => { const v = val(r, s.key); if (v == null) { started = false; return; }
      d += (started ? "L" : "M") + X(xs[i]) + "," + Y(v); started = true; });
    svgEl("path", { d, fill: "none", stroke: cssVar(s.color), "stroke-width": s.width,
      "stroke-linejoin": "round", "stroke-linecap": "round" }, svg);
    const last = [...runs].reverse().find(r => val(r, s.key) != null);
    if (last) ends.push({ s, y: Y(val(last, s.key)) });
  }
  // Direkte Beschriftung am Linienende, ohne Überlappung
  if (m.r > 40) {
    ends.sort((a, b) => a.y - b.y);
    for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 15) ends[i].y = ends[i - 1].y + 15;
    for (const e of ends) svgEl("text", { x: W - m.r + 10, y: e.y + 4, class: "endlbl" }, svg).textContent = e.s.name;
  }

  // Hover
  const g = svgEl("g", { style: "display:none" }, svg);
  const xh = svgEl("line", { y1: m.t, y2: H - m.b, class: "xhair" }, g);
  const dots = series.map(s => svgEl("circle", { r: 4.5, fill: cssVar(s.color), stroke: cssVar("--card"), "stroke-width": 2 }, g));
  const hit = svgEl("rect", { x: m.l, y: 0, width: W - m.l - m.r, height: H, fill: "transparent" }, svg);
  const move = ev => {
    const pt = ev.touches ? ev.touches[0] : ev;
    const box = svg.getBoundingClientRect(), px = (pt.clientX - box.left) * (W / box.width);
    let i = 0, best = Infinity;
    xs.forEach((t, k) => { const dd = Math.abs(X(t) - px); if (dd < best) { best = dd; i = k; } });
    const r = runs[i], x = X(xs[i]);
    g.style.display = ""; xh.setAttribute("x1", x); xh.setAttribute("x2", x);
    series.forEach((s, k) => { const v = val(r, s.key);
      dots[k].style.display = v == null ? "none" : ""; if (v != null) { dots[k].setAttribute("cx", x); dots[k].setAttribute("cy", Y(v)); } });
    showTip(`<div class="h">${dLong.format(toDate(r.t))}</div>` +
      series.map(s => r[s.key] == null ? "" :
        `<div class="row"><i class="swatch" style="background:var(${s.color})"></i><span class="n">${s.name}</span><span class="v">${eur.format(r[s.key])}</span>` +
        (r.d ? `<span class="muted num" style="width:52px;text-align:right">${signed((r[s.key] / r.d - 1) * 100, pct).replace("±", "")} %</span>` : "") + `</div>`).join("") +
      `<div class="row"><i class="swatch dash"></i><span class="n">Eingezahlt</span><span class="v">${eur.format(r.d ?? 0)}</span></div>`,
      pt.clientX, pt.clientY);
  };
  const leave = () => { g.style.display = "none"; hideTip(); };
  hit.addEventListener("mousemove", move); hit.addEventListener("mouseleave", leave);
  hit.addEventListener("touchstart", move, { passive: true }); hit.addEventListener("touchmove", move, { passive: true });
  hit.addEventListener("touchend", leave);

  // Tabellenansicht
  if (table) $(table).innerHTML = `<table><thead><tr><th>Datum</th>${series.map(s => `<th class="r">${s.name}</th>`).join("")}<th class="r">Eingezahlt</th></tr></thead><tbody>` +
    [...runs].reverse().map(r => `<tr><td>${dTime.format(toDate(r.t))}</td>${series.map(s => `<td class="r">${r[s.key] == null ? "–" : eur.format(r[s.key])}</td>`).join("")}<td class="r">${eur.format(r.d ?? 0)}</td></tr>`).join("") +
    `</tbody></table>`;
}

/* ---------- Balken: Vorsprung ---------- */
function barChart() {
  const el = $("chart-lead"); el.innerHTML = "";
  const runs = filtered().filter(r => r.b != null);
  if (runs.length < 2) { el.innerHTML = `<div class="empty">Erscheint, sobald es mehrere Läufe gibt.</div>`; return; }
  const W = el.clientWidth, H = W < 600 ? 150 : 180;
  const m = { t: 10, r: 12, b: 26, l: 52 };
  const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, height: H, role: "img", "aria-label": "Vorsprung des Bots gegenüber dem Sparplan in Euro" }, el);
  const diffs = runs.map(r => r.v - r.b);
  const ext = Math.max(0.5, ...diffs.map(Math.abs));
  const { lo, hi, ticks } = niceTicks(Math.min(0, ...diffs, -ext * 0.25), Math.max(0, ...diffs, ext * 0.25), 3);
  const Y = v => m.t + (1 - (v - lo) / (hi - lo)) * (H - m.t - m.b);
  for (const t of ticks) {
    svgEl("line", { x1: m.l, x2: W - m.r, y1: Y(t), y2: Y(t), class: t === 0 ? "zero" : "gridline" }, svg);
    svgEl("text", { x: m.l - 8, y: Y(t) + 4, "text-anchor": "end" }, svg).textContent = signed(t, eur0).replace("±", "");
  }
  const n = runs.length, slot = (W - m.l - m.r) / n, gap = Math.min(2, slot * 0.3), bw = Math.max(1, Math.min(18, slot - gap));
  const pos = cssVar("--div-pos"), neg = cssVar("--div-neg");
  runs.forEach((r, i) => {
    const d = diffs[i], x = m.l + i * slot + (slot - bw) / 2, y0 = Y(0), y1 = Y(d), h = Math.abs(y1 - y0);
    const top = Math.min(y0, y1), rr = Math.min(4, bw / 2, h);
    const path = d >= 0
      ? `M${x},${y0}V${top + rr}Q${x},${top} ${x + rr},${top}H${x + bw - rr}Q${x + bw},${top} ${x + bw},${top + rr}V${y0}Z`
      : `M${x},${y0}V${y1 - rr}Q${x},${y1} ${x + rr},${y1}H${x + bw - rr}Q${x + bw},${y1} ${x + bw},${y1 - rr}V${y0}Z`;
    if (h > 0.5) svgEl("path", { d: path, fill: d >= 0 ? pos : neg }, svg);
    const hit = svgEl("rect", { x: m.l + i * slot, y: m.t, width: slot, height: H - m.t - m.b, fill: "transparent" }, svg);
    const show = ev => { const pt = ev.touches ? ev.touches[0] : ev;
      showTip(`<div class="h">${dLong.format(toDate(r.t))}</div>
        <div class="row"><span class="n">Vorsprung</span><span class="v ${dirClass(d)}">${arrow(d)}${signed(d)}</span></div>
        <div class="row"><span class="n">Bot</span><span class="v">${eur.format(r.v)}</span></div>
        <div class="row"><span class="n">Sparplan</span><span class="v">${eur.format(r.b)}</span></div>`, pt.clientX, pt.clientY); };
    hit.addEventListener("mousemove", show); hit.addEventListener("mouseleave", hideTip);
    hit.addEventListener("touchstart", show, { passive: true }); hit.addEventListener("touchend", hideTip);
  });
  const nX = Math.min(5, n);
  for (let k = 0; k < nX; k++) {
    const i = Math.round((n - 1) * k / Math.max(1, nX - 1));
    svgEl("text", { x: m.l + i * slot + slot / 2, y: H - 8, "text-anchor": k === 0 ? "start" : k === nX - 1 ? "end" : "middle" }, svg)
      .textContent = dShort.format(toDate(runs[i].t));
  }
}

/* ---------- Statische Teile ---------- */
function renderStatic() {
  const S = DATA.summary, st = DATA.status;
  $("mode").textContent = st.mode === "paper" ? "Papierhandel" : st.mode;
  const status = $("status"), [_, label] = status.children;
  if (st.stopped) { status.className = "pill stop"; label.textContent = "Not-Aus"; }
  else if (st.paused) { status.className = "pill stop"; label.textContent = "Pausiert"; }
  else { status.className = "pill ok"; label.textContent = "Aktiv"; }
  $("updated").textContent = st.last_run ? "Letzter Lauf " + dTime.format(toDate(st.last_run)) : "Noch kein Lauf";
  $("gen").textContent = dTime.format(toDate(DATA.generated_at));

  $("value").textContent = eur.format(S.value);
  const pl = S.value - S.deposited, plp = S.deposited ? pl / S.deposited * 100 : 0;
  $("delta").innerHTML = `<span class="${dirClass(pl)}">${arrow(pl)}${signed(pl)} (${signed(plp, pct).replace("€", "")} %)</span> · ${eur.format(S.deposited)} eingezahlt`;

  $("holdings").innerHTML = DATA.positions.map(p => { const g = p.value - p.cost, kurs = p.kurs ?? (p.qty ? p.value / p.qty : null);
    return `<div class="holding"><div class="holding-top"><span>${esc(p.name)}${p.tier === "risk" ? tagHtml(p) : ""}</span><span class="v num">${eur.format(p.value)}</span></div>
      <div class="holding-sub num"><span class="${dirClass(g)}">${arrow(g)}${pct.format(Math.abs(p.pnl_pct))} %</span>${kurs ? ` · Kurs ${kursEur(kurs)}` : ""}</div></div>`; }).join("");

  const ban = [];
  if (st.stopped) ban.push(`<b>Not-Aus aktiv.</b> Der Bot handelt nicht, bis du ihn wieder löst.`);
  if (st.paused) ban.push(`<b>Bot pausiert.</b> ${esc(st.pause_reason)}`);
  $("banner").innerHTML = ban.map(b => `<div class="banner">${b}</div>`).join("");

  // Aufteilung
  const byCls = { etf: 0, crypto: 0 }, byTier = { core: 0, alt: 0, risk: 0 };
  for (const p of DATA.positions) {
    byCls[p.cls] = (byCls[p.cls] || 0) + p.value;
    if (p.tier) byTier[p.tier] += p.value;
  }
  const total = Math.max(0.01, S.value);
  const parts = [
    { n: "ETFs", v: byCls.etf || 0, c: "--s-etf" },
    ...Object.entries(TIERS).map(([k, t]) => ({ n: t.n, v: byTier[k], c: t.c })),
    { n: "Bargeld", v: S.cash, c: "--s-cash" },
  ];
  $("stack").innerHTML = parts.filter(p => p.v > 0.005).map(p =>
    `<div style="flex:${p.v};background:var(${p.c})" title="${p.n}: ${eur.format(p.v)}"></div>`).join("");
  $("alloc").innerHTML = parts.map(p => `<div class="alloc-row"><i class="swatch" style="background:var(${p.c})"></i>
    <span class="n">${p.n}</span><span class="num">${eur.format(p.v)}</span><span class="p num">${pct.format(p.v / total * 100)} %</span></div>`).join("");
  $("alloc-hint").textContent = "Anteile am Depotwert";
  const meter = (name, wert, lim, c) => { const cp = wert / total * 100; return lim ? `<div class="meter-row"><div class="lbl"><span>${name} <b class="num" style="color:var(--text)">${pct.format(cp)} %</b></span><span>Grenze ${pct.format(lim)} %</span></div>
    <div class="track" role="img" aria-label="${name} ${pct.format(cp)} Prozent von höchstens ${pct.format(lim)} Prozent">
    <div class="fill" style="width:${Math.min(100, cp)}%;background:var(${c})"></div><div class="limit" style="left:calc(${Math.min(100, lim)}% - 1px)"></div></div></div>` : ""; };
  $("meter").innerHTML = meter("Krypto-Anteil", byCls.crypto || 0, DATA.limits.crypto_max_class_pct, "--s-core")
    + meter("Risiko-Anteil", byTier.risk, DATA.limits.risk_max_tier_pct, "--s-risk");

  // Positionen
  $("pos-hint").textContent = DATA.status.has_live_prices ? "Mit aktuellen Kursen bewertet" : "Zum Einstandspreis bewertet (keine aktuellen Kurse)";
  $("positions").innerHTML = DATA.positions.length || S.cash ? `<table><thead><tr><th>Wert</th><th class="r">Betrag</th><th class="r">Gewinn</th><th class="r">Anteil</th></tr></thead><tbody>` +
    DATA.positions.map(p => { const g = p.value - p.cost; return `<tr><td>${esc(p.name)}${tagHtml(p)}</td>
      <td class="r">${eur.format(p.value)}</td><td class="r ${dirClass(g)}">${arrow(g)}${pct.format(Math.abs(p.pnl_pct))} %<div class="muted" style="font-size:12px">${signed(g)}</div></td>
      <td class="r">${pct.format(p.value / total * 100)} %</td></tr>`; }).join("") +
    `<tr><td>Bargeld</td><td class="r">${eur.format(S.cash)}</td><td class="r muted">–</td><td class="r">${pct.format(S.cash / total * 100)} %</td></tr></tbody></table>`
    : `<div class="empty">Noch keine Positionen.</div>`;

  // Claude
  const lastView = [...DATA.runs].reverse().find(r => r.view);
  const lastRun = DATA.runs[DATA.runs.length - 1];
  $("view").textContent = lastView ? lastView.view : "Noch keine Einschätzung.";
  $("view-date").textContent = lastView ? dLong.format(toDate(lastView.t)) : "";
  if (lastRun) {
    $("chips").innerHTML = `<span class="chip"><b class="num">${lastRun.p}</b>vorgeschlagen</span>
      <span class="chip"><b class="num">${lastRun.e}</b>ausgeführt</span>
      <span class="chip"><b class="num">${lastRun.r.length}</b>von der Risikoprüfung gestoppt</span>`;
    $("rej").innerHTML = lastRun.r.map(x => `<li>${esc(x)}</li>`).join("");
  }

  // Kennzahlen
  $("k-fees").textContent = eur.format(S.fees_total);
  $("k-fees-sub").textContent = S.deposited ? `${pct.format(S.fees_total / S.deposited * 100)} % der Einzahlungen` : "";
  $("k-api").textContent = usd.format(S.api_usd);
  $("k-trades").textContent = S.trades_total;
  $("k-trades-sub").textContent = `${S.trades_month} diesen Monat`;
  $("k-runs").textContent = S.runs_total;
  $("k-runs-sub").textContent = DATA.runs.length ? `seit ${dShort.format(toDate(DATA.runs[0].t))}` : "";

  // Trades
  renderTrades();

  renderSparplan();
  renderVergleich();
}

/* ---------- Tab Sparplan ---------- */
function renderSparplan() {
  const S = DATA.summary, sp = DATA.sparplan ?? { units: 0, pending: 0, price: null, buys: [] };
  const wert = S.bench ?? S.deposited, g = wert - S.deposited;
  $("sp-value").textContent = eur.format(wert);
  $("sp-delta").innerHTML = `<span class="${dirClass(g)}">${arrow(g)}${signed(g)} (${pctS(rendite(wert, S.deposited))} %)</span> · ${eur.format(S.deposited)} eingezahlt`;
  $("sp-name").textContent = sp.name ?? "";
  const einsatz = sp.buys.reduce((n, b) => n + b.amount, 0);
  $("k-sp-deposited").textContent = eur.format(S.deposited);
  $("k-sp-deposited-sub").textContent = sp.pending > 0 ? `${eur.format(sp.pending)} warten auf den nächsten Lauf` : "dieselben Einzahlungen wie beim Bot";
  $("k-sp-units").textContent = stueck.format(sp.units);
  $("k-sp-avg").textContent = sp.units ? eur.format(einsatz / sp.units) : "–";
  $("k-sp-price").textContent = sp.price ? eur.format(sp.price) : "–";
  $("sp-buys").innerHTML = sp.buys.length ? `<table><thead><tr><th>Datum</th><th class="r">Betrag</th><th class="r">Kurs</th><th class="r">Anteile</th></tr></thead><tbody>` +
    sp.buys.map(b => `<tr><td>${dShort.format(toDate(b.t))}</td><td class="r">${eur.format(b.amount)}</td><td class="r">${eur.format(b.price)}</td><td class="r">${stueck.format(b.units)}</td></tr>`).join("") +
    `</tbody></table>` : `<div class="empty">Noch keine Käufe. Der erste kommt mit dem ersten Lauf.</div>`;
}

/* ---------- Tab Vergleich ---------- */
// Größter Rückgang vom Höchststand, gemessen an Wert je eingezahltem Euro: Einzahlungen zählen nicht als Gewinn.
function maxRueckgang(key) {
  let peak = 0, dd = null;
  for (const r of DATA.runs) {
    if (r[key] == null || !r.d) continue;
    const q = r[key] / r.d;
    peak = Math.max(peak, q);
    dd = Math.max(dd ?? 0, (1 - q / peak) * 100);
  }
  return dd;
}

function renderVergleich() {
  const S = DATA.summary, b = S.bench;
  if (b == null) {
    $("vs-title").textContent = "Noch kein Vergleich";
    $("vs-big").textContent = "–";
    $("vs-sub").textContent = "Der Sparplan kauft im ersten Lauf.";
  } else {
    const d = S.value - b, pp = rendite(S.value, S.deposited) - rendite(b, S.deposited);
    const gleich = Math.abs(d) < 0.005;
    $("vs-title").textContent = gleich ? "Gleichauf" : d > 0 ? "Der Bot liegt vorne" : "Der Sparplan liegt vorne";
    $("vs-big").textContent = eur.format(Math.abs(d));
    $("vs-sub").textContent = `${pct.format(Math.abs(pp))} Prozentpunkte · Bot ${eur.format(S.value)} · Sparplan ${eur.format(b)}`;
  }
  const dd = k => { const v = maxRueckgang(k); return v == null ? "–" : `${v > 0 ? "−" : ""}${pct.format(v)} %`; };
  const zeile = (n, x, y) => `<tr><td>${n}</td><td class="r">${x}</td><td class="r">${y}</td></tr>`;
  $("vs-table").innerHTML = `<table><thead><tr><th></th>
    <th class="r"><i class="swatch" style="background:var(--s-bot)"></i> Bot</th>
    <th class="r"><i class="swatch" style="background:var(--s-etf)"></i> Sparplan</th></tr></thead><tbody>` +
    zeile("Wert", eur.format(S.value), b == null ? "–" : eur.format(b)) +
    zeile("Rendite", `${pctS(rendite(S.value, S.deposited))} %`, b == null ? "–" : `${pctS(rendite(b, S.deposited))} %`) +
    zeile("Gebühren", eur.format(S.fees_total), `${eur.format(0)}<div class="muted" style="font-size:12px">nur Spread</div>`) +
    zeile("Größter Rückgang", dd("v"), dd("b")) + `</tbody></table>`;
}

function renderTrades() {
  const LIMIT = 6, list = showAllTrades ? DATA.trades : DATA.trades.slice(0, LIMIT);
  const more = DATA.trades.length > LIMIT
    ? `<button class="more" id="more">${showAllTrades ? "Weniger anzeigen" : `Alle ${DATA.trades.length} Trades anzeigen`}</button>` : "";
  $("trades").innerHTML = (DATA.trades.length ? list.map(t => `<div class="trade">
      <div class="when">${dTime.format(toDate(t.t))}</div>
      <div class="what"><span class="side">${t.side === "buy" ? "KAUF" : "VERKAUF"}</span>${esc(t.name)}</div>
      <div><div class="amt">${t.side === "buy" ? "−" : "+"}${eur.format(t.amount)}</div><div class="fee">Gebühr ${eur.format(t.fee)}</div></div>
      ${t.qty != null && t.price != null ? `<div class="how num">${stueck.format(t.qty)} Stück zu je ${kursEur(t.price)} <span class="muted">inkl. Spread</span></div>` : ""}
      <div class="why">${esc(t.reason)}${t.conf != null ? ` <span class="muted">· Sicherheit ${Math.round(t.conf * 100)} %</span>` : ""}</div>
    </div>`).join("") : `<div class="empty">Noch keine Trades.</div>`) + more;
  $("more")?.addEventListener("click", () => { showAllTrades = !showAllTrades; renderTrades(); });
}

function renderCharts() {
  if (!DATA) return;
  if (tab === "bot") lineChart({ id: "chart-bot", series: [BOT], aria: "Wertentwicklung des Bots" });
  if (tab === "sparplan") lineChart({ id: "chart-sparplan", series: [SPARPLAN], aria: "Wertentwicklung des Sparplans" });
  if (tab === "vergleich") {
    lineChart({ id: "chart-vergleich", series: [BOT, SPARPLAN], P: unit === "pct", legend: "legend-vergleich", hint: "hint-vergleich", table: "table-vergleich", aria: "Wertentwicklung von Bot und Sparplan" });
    barChart();
  }
}

/* ---------- Tabs ---------- */
const TABS = ["bot", "sparplan", "vergleich"];
let tab = "bot";
try { tab = localStorage.getItem("tb-tab") || "bot"; } catch (e) {}
const ausHash = () => location.hash.slice(1);
if (TABS.includes(ausHash())) tab = ausHash();
if (!TABS.includes(tab)) tab = "bot";

function zeigeTab(name, nachOben = true) {
  tab = name;
  try { localStorage.setItem("tb-tab", name); } catch (e) {}
  if (ausHash() !== name) history.replaceState(null, "", "#" + name);
  for (const t of TABS) {
    $("tab-" + t).hidden = t !== name;
    const b = $("tabbtn-" + t);
    b.setAttribute("aria-selected", String(t === name));
    b.tabIndex = t === name ? 0 : -1;
  }
  if (nachOben) scrollTo(0, 0);
  renderCharts();
}
for (const t of TABS) $("tabbtn-" + t).addEventListener("click", () => zeigeTab(t));
addEventListener("hashchange", () => { if (TABS.includes(ausHash())) zeigeTab(ausHash()); });
zeigeTab(tab, false);

$("unit").querySelectorAll("button").forEach(b => {
  b.setAttribute("aria-pressed", String(b.dataset.u === unit));
  b.addEventListener("click", () => {
    unit = b.dataset.u;
    try { localStorage.setItem("tb-unit", unit); } catch (e) {}
    $("unit").querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
    renderCharts();
  });
});

/* ---------- Steuerung ---------- */
const rangeButtons = document.querySelectorAll(".range-seg button");
rangeButtons.forEach(b => {
  b.setAttribute("aria-pressed", String(Number(b.dataset.r) === range));
  b.addEventListener("click", () => {
    range = Number(b.dataset.r);
    try { localStorage.setItem("tb-range", range); } catch (e) {}
    rangeButtons.forEach(x => x.setAttribute("aria-pressed", String(Number(x.dataset.r) === range)));
    renderCharts();
  });
});
$("theme").addEventListener("click", () => {
  const dark = document.documentElement.dataset.theme
    ? document.documentElement.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  document.documentElement.dataset.theme = dark ? "light" : "dark";
  try { localStorage.setItem("tb-theme", document.documentElement.dataset.theme); } catch (e) {}
  renderCharts();
});
matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", renderCharts);
// Nur auf neue Breite reagieren: Beim Tabwechsel ändert sich die Höhe, das braucht kein zweites Zeichnen.
let rt, breite = 0;
new ResizeObserver(([e]) => {
  if (e.contentRect.width === breite) return;
  breite = e.contentRect.width;
  clearTimeout(rt); rt = setTimeout(renderCharts, 60);
}).observe(document.querySelector("main"));

export function zeigen(daten) {
  DATA = daten;
  renderStatic();
  renderCharts();
}
