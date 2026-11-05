// Die App gegen eine nachgestellte Supabase: Kein Test berührt das echte Projekt.
import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const ZEIT = '2026-11-05T09:15:05+00:00';
const RUNS = [
  { zeit: '2026-11-06T09:15:05+00:00', portfolio_value_eur: 101.5, cash_eur: 49.01, deposited_eur: 100, benchmark_value_eur: 100.2, crypto_benchmark_value_eur: 99.1, orders_proposed: 2, orders_executed: 0, rejections: ['Krypto-Grenze überschritten'], market_view: 'Ruhiger Markt.', api_cost_usd_total: 0.002 },
  { zeit: ZEIT, portfolio_value_eur: 98.96, cash_eur: 49.01, deposited_eur: 100, benchmark_value_eur: 99.9, crypto_benchmark_value_eur: 99.9, orders_proposed: 1, orders_executed: 1, rejections: [], market_view: 'Erster Kauf.', api_cost_usd_total: 0.001 },
];
const TRADES = [{ zeit: ZEIT, nr: 0, symbol: 'EUNL.DE', name: 'iShares Core MSCI World (Xetra)', asset_class: 'etf', side: 'buy', qty: 0.38, exec_price_eur: 130.6, amount_eur: 50, fee_eur: 0.99, confidence: 0.8, reason: 'Kern' }];
const POSITIONS = [{ symbol: 'EUNL.DE', name: 'iShares Core MSCI World (Xetra)', asset_class: 'etf', qty: 0.38, value_eur: 52.49, cost_eur: 50, pnl_pct: 4.98, live: true }];
const status = (extra = {}) => ({
  id: 1, not_aus: false, not_aus_seit: null, pause: false, grund: '', letzter_lauf: RUNS[0].zeit,
  kennzahlen: {
    summary: { value: 101.5, cash: 49.01, deposited: 100, bench: 100.2, cbench: 99.1, fees_total: 0.99, api_usd: 0.002, trades_total: 1, trades_month: 1, runs_total: 2 },
    limits: { crypto_max_class_pct: 35 }, mode: 'paper', has_live_prices: true, stop_datei: false, generated_at: RUNS[0].zeit,
  }, ...extra,
});

const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
const SITZUNG = {
  access_token: `${b64({ alg: 'HS256' })}.${b64({ sub: 'u1', exp: 4102444800 })}.x`, refresh_token: 'r', token_type: 'bearer',
  expires_in: 3600, expires_at: 4102444800, user: { id: 'u1', email: 'ich@example.com', aud: 'authenticated', role: 'authenticated' },
};

async function supabase(page: Page, opt: { status?: object[] } = {}) {
  const stand = { status: opt.status ?? [status()], patches: [] as object[], registriert: 0 };
  await page.route('https://mhueskuqqecqxawtzizr.supabase.co/**', async (route) => {
    const req = route.request(), url = new URL(req.url()), teil = url.pathname;
    const json = (body: unknown, code = 200) => route.fulfill({ status: code, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' }, body: JSON.stringify(body) });
    if (req.method() === 'OPTIONS') return json({});
    if (teil.endsWith('/auth/v1/token')) {
      const { password } = req.postDataJSON();
      return password === 'richtig-123' ? json(SITZUNG) : json({ error_code: 'invalid_credentials', msg: 'Invalid login credentials' }, 400);
    }
    if (teil.endsWith('/auth/v1/signup')) { stand.registriert += 1; return json(SITZUNG); }
    if (teil.endsWith('/auth/v1/logout')) return json({});
    if (teil.endsWith('/rest/v1/runs')) return json(RUNS);
    if (teil.endsWith('/rest/v1/trades')) return json(TRADES);
    if (teil.endsWith('/rest/v1/positions')) return json(POSITIONS);
    if (teil.endsWith('/rest/v1/status')) {
      if (req.method() === 'PATCH') {
        const neu = req.postDataJSON();
        stand.patches.push(neu);
        stand.status = [{ ...stand.status[0], ...neu }];
      }
      return json(stand.status);
    }
    return json([]);
  });
  return stand;
}

async function anmelden(page: Page) {
  await page.goto('/');
  await page.fill('#email', 'ich@example.com');
  await page.fill('#passwort', 'richtig-123');
  await page.click('#login-btn');
  await expect(page.locator('#app')).toBeVisible();
}

test('ohne Anmeldung ist nur das Formular zu sehen', async ({ page }) => {
  await supabase(page);
  await page.goto('/');
  await expect(page.locator('#login-form')).toBeVisible();
  await expect(page.locator('#app')).toBeHidden();
});

test('falsches Passwort zeigt einen verständlichen Fehler', async ({ page }) => {
  await supabase(page);
  await page.goto('/');
  await page.fill('#email', 'ich@example.com');
  await page.fill('#passwort', 'falsch-12345');
  await page.click('#login-btn');
  await expect(page.locator('#login-err')).toHaveText('E-Mail oder Passwort stimmt nicht.');
});

test('nach der Anmeldung zeigt die App alles wie das Dashboard', async ({ page }) => {
  await supabase(page);
  await anmelden(page);
  await expect(page.locator('#value')).toHaveText(/101,50/);
  await expect(page.locator('#compare .cmp')).toHaveCount(2);
  await expect(page.locator('#chart1 svg')).toBeVisible();
  await expect(page.locator('#chart2 svg')).toBeVisible();
  await expect(page.locator('#meter')).toContainText('Grenze 35,0 %');
  await expect(page.locator('#positions')).toContainText('MSCI World');
  await expect(page.locator('#view')).toHaveText('Ruhiger Markt.');
  await expect(page.locator('#rej')).toContainText('Krypto-Grenze');
  await expect(page.locator('#k-runs')).toHaveText('2');
  await expect(page.locator('#trades')).toContainText('KAUF');
  await page.click('#unit button[data-u="eur"]');
  await expect(page.locator('#hint1')).toContainText('Euro');
});

test('die älteste Zeile steht im Diagramm links: Läufe werden umgedreht', async ({ page }) => {
  await supabase(page);
  await anmelden(page);
  await expect(page.locator('#k-runs-sub')).toContainText('seit 5. Nov');
});

test('Konto ohne Zugriffsregel bekommt einen Hinweis statt leerer Seite', async ({ page }) => {
  await supabase(page, { status: [] });
  await page.goto('/');
  await page.fill('#email', 'ich@example.com');
  await page.fill('#passwort', 'richtig-123');
  await page.click('#login-btn');
  await expect(page.locator('#hinweis-titel')).toHaveText('Konto noch nicht freigeschaltet');
  await expect(page.locator('#app')).toBeHidden();
});

test('Not-Aus: Abbrechen ändert nichts', async ({ page }) => {
  const stand = await supabase(page);
  await anmelden(page);
  await page.click('#notaus-btn');
  await expect(page.locator('#frage')).toBeVisible();
  await page.click('#frage-nein');
  await expect(page.locator('#frage')).toBeHidden();
  expect(stand.patches).toEqual([]);
});

test('Not-Aus setzen und lösen, jeweils mit Sicherheitsabfrage', async ({ page }) => {
  const stand = await supabase(page);
  await anmelden(page);
  await page.click('#notaus-btn');
  await expect(page.locator('#frage-titel')).toHaveText('Not-Aus aktivieren?');
  await page.click('#frage-ja');
  await expect(page.locator('#status')).toContainText('Not-Aus');
  await expect(page.locator('#banner')).toContainText('Not-Aus aktiv');
  await expect(page.locator('#notaus-btn')).toHaveText('Lösen');
  expect(stand.patches[0]).toMatchObject({ not_aus: true });
  // Nur diese beiden Spalten darf der Nutzer laut Datenbank ändern.
  expect(Object.keys(stand.patches[0]).sort()).toEqual(['not_aus', 'not_aus_seit']);

  await page.click('#notaus-btn');
  await expect(page.locator('#frage-titel')).toHaveText('Not-Aus lösen?');
  await page.click('#frage-ja');
  await expect(page.locator('#status')).toContainText('Aktiv');
  expect(stand.patches[1]).toEqual({ not_aus: false, not_aus_seit: null });
});

test('STOP-Datei des Bots zeigt ebenfalls Not-Aus, Pause mit Grund', async ({ page }) => {
  const s = status();
  await supabase(page, { status: [{ ...s, pause: true, grund: 'Drawdown 25 %', kennzahlen: { ...s.kennzahlen, stop_datei: true } }] });
  await anmelden(page);
  await expect(page.locator('#status')).toContainText('Not-Aus');
  await expect(page.locator('#banner')).toContainText('Drawdown 25 %');
});

test('Abmelden führt zurück zum Formular', async ({ page }) => {
  await supabase(page);
  await anmelden(page);
  await page.locator('footer [data-abmelden]').click();
  await expect(page.locator('#login-form')).toBeVisible();
});

test('passt aufs iPhone: kein seitliches Scrollen, Schaltflächen groß genug', async ({ page }) => {
  await supabase(page);
  await anmelden(page);
  const breite = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
  expect(breite[0]).toBeLessThanOrEqual(breite[1]);
  for (const id of ['#notaus-btn', '#push-btn']) {
    const box = await page.locator(id).boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }
});

test('alles im Browser trägt das Präfix tb-', async ({ page }) => {
  await supabase(page);
  await anmelden(page);
  await page.click('#unit button[data-u="eur"]');
  await page.click('#range button[data-r="30"]');
  const schluessel = await page.evaluate(() => Object.keys(localStorage));
  expect(schluessel.length).toBeGreaterThan(0);
  for (const k of schluessel) expect(k).toMatch(/^tb-/);
});

test('keine Verstöße gegen die Sicherheitsregeln (CSP)', async ({ page }) => {
  const fehler: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error' && /Content Security Policy/i.test(m.text())) fehler.push(m.text()); });
  page.on('pageerror', (e) => fehler.push(e.message));
  await supabase(page);
  await anmelden(page);
  await expect(page.locator('#chart1 svg')).toBeVisible();
  expect(fehler).toEqual([]);
});

test('Service Worker und Manifest bleiben im eigenen Bereich', () => {
  const sw = readFileSync('sw.js', 'utf-8');
  expect(sw).toMatch(/const SPEICHER = 'tb-/);
  // Darf nie Caches von Wir zwei löschen.
  expect(sw).toContain("n.startsWith('tb-')");
  const m = JSON.parse(readFileSync('manifest.webmanifest', 'utf-8'));
  expect(m.name).toBe('Trading Bot');
  expect(m.scope).toBe('./');
  expect(m.display).toBe('standalone');
});

test('die App enthält keine Geheimnisse', () => {
  const konfig = readFileSync('js/konfig.js', 'utf-8');
  expect(konfig).not.toMatch(/sb_secret_/);
  const jwt = konfig.match(/eyJ[\w-]+\.(eyJ[\w-]+)\./)![1];
  expect(JSON.parse(Buffer.from(jwt, 'base64url').toString()).role).toBe('anon');
});
