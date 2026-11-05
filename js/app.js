// Anmeldung, Daten aus Supabase, Not-Aus und Mitteilungen. Die Darstellung steckt in dashboard.js.

import { createClient } from './vendor/supabase-2.45.4.js';
import { konfig } from './konfig.js';
import { zeigen } from './dashboard.js';

const $ = (id) => document.getElementById(id);

// Eigener Name für die Sitzung: Wir zwei liegt auf derselben Domain.
const sb = createClient(konfig.supabaseUrl, konfig.supabaseKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'tb-auth' },
});

let notAus = false;
let live = null; // Letzter Abruf von „Jetzt aktualisieren“, nur im Arbeitsspeicher
let letzterStand = null;

function ansicht(name) {
  for (const id of ['login', 'hinweis', 'app']) $(id).hidden = id !== name;
}

function hinweis(titel, text) {
  $('hinweis-titel').textContent = titel;
  $('hinweis-text').textContent = text;
  ansicht('hinweis');
}

function uebersetzeFehler(text = '') {
  if (/invalid login credentials/i.test(text)) return 'E-Mail oder Passwort stimmt nicht.';
  if (/rate limit|security purposes/i.test(text)) return 'Bitte kurz warten und es dann noch einmal versuchen.';
  if (/already registered|already exists/i.test(text)) return 'Diese E-Mail ist schon registriert. Melde dich einfach an.';
  if (/password should be|password.*at least/i.test(text)) return 'Das Passwort braucht mindestens 8 Zeichen.';
  if (/email not confirmed/i.test(text)) return 'Bitte bestätige zuerst deine E-Mail-Adresse über den Link in der Mail.';
  if (/signups? not allowed|signup.*disabled/i.test(text)) return 'Neue Konten sind abgeschaltet.';
  if (/failed to fetch|network|load failed/i.test(text)) return 'Keine Verbindung. Bist du online?';
  return text;
}

function pruefe({ data, error }) {
  if (error) throw new Error(uebersetzeFehler(error.message));
  return data;
}

// ───────── Daten ─────────

// Bringt die Tabellen in die Form, die dashboard.js aus dem Bot kennt.
export function zuDashboard(runs, trades, positions, status) {
  const k = status.kennzahlen ?? {};
  const stopped = status.not_aus || Boolean(k.stop_datei);
  return {
    generated_at: k.generated_at ?? status.letzter_lauf,
    status: {
      mode: k.mode ?? 'paper', paused: status.pause, pause_reason: status.grund, stopped,
      last_run: status.letzter_lauf, has_live_prices: Boolean(k.has_live_prices),
    },
    summary: k.summary ?? { value: 0, cash: 0, deposited: 0, bench: null, cbench: null, fees_total: 0, api_usd: 0, trades_total: 0, trades_month: 0, runs_total: 0 },
    limits: k.limits ?? {},
    vergleich: { etf: k.benchmark, krypto: k.crypto_benchmark },
    runs: runs.map((r) => ({
      t: r.zeit, v: r.portfolio_value_eur, c: r.cash_eur, d: r.deposited_eur, b: r.benchmark_value_eur,
      cb: r.crypto_benchmark_value_eur, p: r.orders_proposed, e: r.orders_executed, r: r.rejections ?? [],
      view: r.market_view ?? '', api: r.api_cost_usd_total,
    })),
    trades: trades.map((t) => ({
      t: t.zeit, symbol: t.symbol, name: t.name, cls: t.asset_class, side: t.side, qty: t.qty, price: t.exec_price_eur,
      amount: t.amount_eur, fee: t.fee_eur, conf: t.confidence, reason: t.reason,
    })),
    positions: positions.map((p) => ({
      symbol: p.symbol, name: p.name, cls: p.asset_class, qty: p.qty, value: p.value_eur, cost: p.cost_eur,
      pnl_pct: p.pnl_pct, live: p.live,
    })),
  };
}

const rund = (n) => Math.round(n * 100) / 100;

// Bewertet das Depot zu neuen Kursen, mit denselben Formeln wie dashboard.collect im Bot.
// Fehlt ein Kurs, bleibt der Wert aus dem letzten Lauf stehen.
export function mitKursen(daten, preise) {
  const positions = daten.positions.map((p) => {
    const kurs = preise[p.symbol];
    if (!kurs) return p;
    const value = rund(p.qty * kurs);
    return { ...p, value, pnl_pct: p.cost ? rund((value / p.cost - 1) * 100) : 0, live: true };
  }).sort((a, b) => b.value - a.value);

  const { etf, krypto } = daten.vergleich;
  const summary = { ...daten.summary, value: rund(daten.summary.cash + positions.reduce((s, p) => s + p.value, 0)) };
  if (etf?.symbol && preise[etf.symbol]) summary.bench = rund(etf.units * preise[etf.symbol] + etf.pending);
  const stueck = Object.entries(krypto?.units ?? {});
  if (stueck.length && stueck.every(([s]) => preise[s])) {
    summary.cbench = rund(stueck.reduce((s, [sym, q]) => s + q * preise[sym], 0) + krypto.pending);
  }
  return {
    ...daten, positions, summary,
    status: { ...daten.status, has_live_prices: positions.some((p) => p.live) },
  };
}

const uhrzeit = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' });

function zeigeLive(daten) {
  if (!live) {
    $('live-text').textContent = '';
    return daten;
  }
  const neu = mitKursen(daten, live.preise);
  const namen = live.fehlend.map((s) => daten.positions.find((p) => p.symbol === s)?.name ?? s);
  $('live-text').textContent = `Live-Stand von ${uhrzeit.format(new Date(live.zeit))} Uhr, nicht gespeichert.`
    + (namen.length ? ` Ohne aktuellen Kurs: ${namen.join(', ')}.` : '');
  return { ...neu, generated_at: live.zeit };
}

async function laden() {
  try {
    const [runs, trades, positions, status] = await Promise.all([
      // Der Server liefert höchstens 1000 Zeilen, deshalb die neuesten holen und dann umdrehen.
      sb.from('runs').select('*').order('zeit', { ascending: false }).limit(1000).then(pruefe),
      sb.from('trades').select('*').order('zeit', { ascending: false }).order('nr').limit(1000).then(pruefe),
      sb.from('positions').select('*').order('value_eur', { ascending: false }).then(pruefe),
      sb.from('status').select('*').eq('id', 1).then(pruefe),
    ]);
    // Ohne Zugriffsregel für dieses Konto liefert die Datenbank einfach nichts.
    if (!status.length) {
      hinweis('Konto noch nicht freigeschaltet', 'Die Anmeldung hat geklappt. Sobald die Zugriffsregeln für dein Konto stehen, siehst du hier dein Depot.');
      return;
    }
    notAus = status[0].not_aus;
    ansicht('app');
    // Ein neuerer Lauf ist genauer als der letzte Abruf.
    if (live && new Date(status[0].letzter_lauf) > new Date(live.zeit)) live = null;
    letzterStand = zuDashboard(runs.reverse(), trades, positions, status[0]);
    zeigen(zeigeLive(letzterStand));
    zeigeNotAus(status[0]);
    await zeigePush();
  } catch (e) {
    hinweis('Daten nicht geladen', e.message);
  }
}

// ───────── Anmeldung ─────────

$('registrieren').hidden = !konfig.registrierung;

function formWerte() {
  return { email: $('email').value.trim(), password: $('passwort').value };
}

async function anmeldeVersuch(aktion) {
  $('login-err').textContent = '';
  if (!$('login-form').reportValidity()) return;
  $('login-btn').disabled = true;
  try {
    await aktion();
    $('passwort').value = '';
    const { data: { session } } = await sb.auth.getSession();
    if (session) await laden();
    else $('login-err').textContent = 'Bitte bestätige zuerst deine E-Mail-Adresse über den Link in der Mail und melde dich dann an.';
  } catch (e) {
    $('login-err').textContent = e.message;
  } finally {
    $('login-btn').disabled = false;
  }
}

$('login-form').addEventListener('submit', (ev) => {
  ev.preventDefault();
  anmeldeVersuch(async () => pruefe(await sb.auth.signInWithPassword(formWerte())));
});

$('registrieren').addEventListener('click', () => {
  anmeldeVersuch(async () => pruefe(await sb.auth.signUp(formWerte())));
});

document.querySelectorAll('[data-abmelden]').forEach((b) => b.addEventListener('click', async () => {
  await sb.auth.signOut();
  ansicht('login');
}));

$('hinweis-neu').addEventListener('click', laden);

// ───────── Sicherheitsabfrage ─────────

function frage(titel, text, ja) {
  $('frage-titel').textContent = titel;
  $('frage-text').textContent = text;
  $('frage-ja').textContent = ja;
  const d = $('frage');
  d.showModal();
  return new Promise((fertig) => {
    const schliessen = (wert) => { $('frage-ja').onclick = $('frage-nein').onclick = d.oncancel = null; d.close(); fertig(wert); };
    $('frage-ja').onclick = () => schliessen(true);
    $('frage-nein').onclick = () => schliessen(false);
    d.oncancel = (ev) => { ev.preventDefault(); schliessen(false); };
  });
}

// ───────── Not-Aus ─────────

function zeigeNotAus(status) {
  $('notaus-btn').textContent = status.not_aus ? 'Lösen' : 'Aktivieren';
  $('notaus-btn').className = status.not_aus ? 'btn' : 'btn danger';
  $('notaus-text').textContent = status.not_aus
    ? `Aktiv seit ${new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(status.not_aus_seit))}. Der Bot handelt nicht.`
    : 'Hält den Bot vor dem nächsten Lauf an.';
}

$('notaus-btn').addEventListener('click', async () => {
  const setzen = !notAus;
  const ok = await frage(
    setzen ? 'Not-Aus aktivieren?' : 'Not-Aus lösen?',
    setzen ? 'Der Bot handelt ab dem nächsten Lauf nicht mehr, bis du den Not-Aus wieder löst.' : 'Der Bot handelt ab dem nächsten Lauf wieder.',
    setzen ? 'Aktivieren' : 'Lösen',
  );
  if (!ok) return;
  $('notaus-btn').disabled = true;
  try {
    const zeilen = pruefe(await sb.from('status')
      .update({ not_aus: setzen, not_aus_seit: setzen ? new Date().toISOString() : null })
      .eq('id', 1).select());
    if (!zeilen.length) throw new Error('Das ist für dieses Konto nicht erlaubt.');
    await laden();
  } catch (e) {
    $('notaus-text').textContent = `Nicht geändert: ${e.message}`;
  } finally {
    $('notaus-btn').disabled = false;
  }
});

// ───────── Jetzt aktualisieren ─────────

const LIVE_PAUSE = 30000; // schont Yahoo und Kraken

$('live-btn').addEventListener('click', async () => {
  const btn = $('live-btn');
  btn.disabled = true;
  $('live-text').textContent = 'Kurse werden geholt …';
  try {
    const antwort = pruefe(await sb.functions.invoke('kurse', { method: 'POST' }));
    if (!Object.keys(antwort?.preise ?? {}).length) throw new Error('keine Kurse');
    live = { preise: antwort.preise, fehlend: antwort.fehlend ?? [], zeit: antwort.zeit };
    zeigen(zeigeLive(letzterStand));
  } catch {
    $('live-text').textContent = live
      ? 'Aktuelle Kurse gerade nicht abrufbar. Der letzte Live-Stand bleibt.'
      : 'Aktuelle Kurse gerade nicht abrufbar. Der Stand vom letzten Lauf bleibt.';
  }
  setTimeout(() => { btn.disabled = false; }, LIVE_PAUSE);
});

// ───────── Mitteilungen ─────────

function pushMoeglich() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

function schluesselBytes(b64url) {
  const b64 = (b64url + '='.repeat((4 - (b64url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(b64), (z) => z.charCodeAt(0));
}

async function zeigePush() {
  const btn = $('push-btn'), text = $('push-text');
  if (!pushMoeglich()) {
    btn.hidden = true;
    text.textContent = 'Auf dem iPhone ab iOS 16.4: erst über Teilen → „Zum Home-Bildschirm“ installieren und von dort öffnen.';
    return;
  }
  const reg = await navigator.serviceWorker.getRegistration();
  const abo = await reg?.pushManager.getSubscription();
  btn.hidden = false;
  btn.textContent = abo ? 'Ausschalten' : 'Mitteilungen aktivieren';
  text.textContent = abo ? 'Nach jedem Lauf eine Mitteilung auf diesem Gerät.' : 'Depotstand und Trades nach jedem Lauf.';
}

$('push-btn').addEventListener('click', async () => {
  $('push-btn').disabled = true;
  try {
    const reg = await navigator.serviceWorker.ready;
    const vorhanden = await reg.pushManager.getSubscription();
    if (vorhanden) {
      pruefe(await sb.from('push_abos').delete().eq('endpoint', vorhanden.endpoint));
      await vorhanden.unsubscribe();
    } else {
      if (await Notification.requestPermission() !== 'granted') {
        throw new Error('Mitteilungen sind nicht erlaubt. Du kannst sie in den iPhone-Einstellungen einschalten.');
      }
      const abo = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: schluesselBytes(konfig.pushSchluessel) });
      const { endpoint, keys } = abo.toJSON();
      pruefe(await sb.from('push_abos').delete().eq('endpoint', endpoint));
      pruefe(await sb.from('push_abos').insert({ endpoint, p256dh: keys.p256dh, auth: keys.auth }));
    }
    await zeigePush();
  } catch (e) {
    $('push-text').textContent = e.message;
  } finally {
    $('push-btn').disabled = false;
  }
});

// ───────── Start ─────────

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js', { scope: './' }).catch(() => {});

// Beim Zurückkehren in die App den neuesten Stand holen.
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState !== 'visible' || !$('login').hidden) return;
  const { data: { session } } = await sb.auth.getSession();
  if (session) laden();
});

const { data: { session } } = await sb.auth.getSession();
if (session) await laden();
else ansicht('login');
