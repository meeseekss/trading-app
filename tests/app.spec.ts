// Die App gegen eine nachgestellte Supabase: Kein Test berührt das echte Projekt.
import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const ZEIT = '2026-11-05T09:15:05+00:00';
const RUNS = [
  { zeit: '2026-11-07T09:15:05+00:00', portfolio_value_eur: 156, cash_eur: 74.01, deposited_eur: 150, benchmark_value_eur: 153, orders_proposed: 2, orders_executed: 1, rejections: ['Krypto wäre über 35 %'], market_view: 'Ruhiger Markt.', api_cost_usd_total: 0.002 },
  { zeit: '2026-11-06T09:15:05+00:00', portfolio_value_eur: 141, cash_eur: 74.01, deposited_eur: 150, benchmark_value_eur: 147, orders_proposed: 0, orders_executed: 0, rejections: [], market_view: 'Schwach.', api_cost_usd_total: 0.0015 },
  { zeit: ZEIT, portfolio_value_eur: 150, cash_eur: 74.01, deposited_eur: 150, benchmark_value_eur: 149.85, orders_proposed: 1, orders_executed: 1, rejections: [], market_view: 'Erster Kauf.', api_cost_usd_total: 0.001 },
];
const TRADES = [{ zeit: ZEIT, nr: 0, symbol: 'EUNL.DE', name: 'iShares Core MSCI World (Xetra)', asset_class: 'etf', side: 'buy', qty: 0.38, exec_price_eur: 130.6, amount_eur: 75, fee_eur: 0.99, confidence: 0.8, reason: 'Kern' }];
const POSITIONS = [{ symbol: 'EUNL.DE', name: 'iShares Core MSCI World (Xetra)', asset_class: 'etf', tier: null, qty: 0.38, value_eur: 52.49, cost_eur: 50, pnl_pct: 4.98, live: true }];
const KRYPTO = [
  { symbol: 'XBTEUR', name: 'Bitcoin', asset_class: 'crypto', tier: 'core', qty: 0.0002, value_eur: 18, cost_eur: 17, pnl_pct: 5.88, live: true },
  { symbol: 'SOLEUR', name: 'Solana', asset_class: 'crypto', tier: 'alt', qty: 0.1, value_eur: 8, cost_eur: 8, pnl_pct: 0, live: true },
  { symbol: 'PEPEEUR', name: 'Pepe', asset_class: 'crypto', tier: 'risk', qty: 1750000, value_eur: 7.5, cost_eur: 7.5, pnl_pct: 0, live: true },
];
const KAEUFE = [
  { zeit: '2026-12-01T09:15:05+00:00', symbol: 'EUNL.DE', betrag_eur: 150, kurs_eur: 150, anteile: 1 },
  { zeit: ZEIT, symbol: 'EUNL.DE', betrag_eur: 150, kurs_eur: 100, anteile: 1.5 },
];
const status = (extra = {}) => ({
  id: 1, not_aus: false, not_aus_seit: null, pause: false, grund: '', letzter_lauf: RUNS[0].zeit,
  kennzahlen: {
    summary: { value: 156, cash: 103.51, deposited: 150, bench: 153, fees_total: 0.99, api_usd: 0.002, trades_total: 1, trades_month: 1, runs_total: 3 },
    limits: { crypto_max_class_pct: 35, risk_max_tier_pct: 10 }, mode: 'paper', has_live_prices: true, stop_datei: false, generated_at: RUNS[0].zeit,
    benchmark: { symbol: 'EUNL.DE', name: 'iShares Core MSCI World (Xetra)', units: 2.5, pending: 0, price: 122 },
  }, ...extra,
});

const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
const SITZUNG = {
  access_token: `${b64({ alg: 'HS256' })}.${b64({ sub: 'u1', exp: 4102444800 })}.x`, refresh_token: 'r', token_type: 'bearer',
  expires_in: 3600, expires_at: 4102444800, user: { id: 'u1', email: 'ich@example.com', aud: 'authenticated', role: 'authenticated' },
};

type Kurse = { code?: number; body?: object };
async function supabase(page: Page, opt: { status?: object[]; kurse?: Kurse; positions?: object[]; kaeufe?: object[]; runs?: object[] } = {}) {
  const stand = { status: opt.status ?? [status()], patches: [] as object[], registriert: 0, schreibzugriffe: 0, kursAbrufe: 0 };
  await page.route('https://mhueskuqqecqxawtzizr.supabase.co/**', async (route) => {
    const req = route.request(), url = new URL(req.url()), teil = url.pathname;
    const json = (body: unknown, code = 200) => route.fulfill({ status: code, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' }, body: JSON.stringify(body) });
    if (req.method() === 'OPTIONS') return json({});
    if (teil.endsWith('/functions/v1/kurse')) {
      stand.kursAbrufe += 1;
      return json(opt.kurse?.body ?? {}, opt.kurse?.code ?? 200);
    }
    if (teil.includes('/rest/v1/') && req.method() !== 'GET') stand.schreibzugriffe += 1;
    if (teil.endsWith('/auth/v1/token')) {
      const { password } = req.postDataJSON();
      return password === 'richtig-123' ? json(SITZUNG) : json({ error_code: 'invalid_credentials', msg: 'Invalid login credentials' }, 400);
    }
    if (teil.endsWith('/auth/v1/signup')) { stand.registriert += 1; return json(SITZUNG); }
    if (teil.endsWith('/auth/v1/logout')) return json({});
    if (teil.endsWith('/rest/v1/runs')) return json(opt.runs ?? RUNS);
    if (teil.endsWith('/rest/v1/trades')) return json(TRADES);
    if (teil.endsWith('/rest/v1/positions')) return json(opt.positions ?? POSITIONS);
    if (teil.endsWith('/rest/v1/sparplan_kaeufe')) return json(opt.kaeufe ?? KAEUFE);
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

test('Tab Bot zeigt Depot, Kurve, Aufteilung, Positionen, Einschätzung, Kennzahlen, Trades und Steuerung', async ({ page }) => {
  await supabase(page, { positions: [...POSITIONS, ...KRYPTO] });
  await anmelden(page);
  await expect(page.locator('#value')).toHaveText(/156,00/);
  await expect(page.locator('#chart-bot svg')).toBeVisible();
  await expect(page.locator('#alloc')).toContainText('Krypto Basis');
  await expect(page.locator('#alloc')).toContainText('Krypto Altcoins');
  await expect(page.locator('#alloc')).toContainText('Krypto Risiko');
  await expect(page.locator('#alloc')).toContainText('Bargeld');
  await expect(page.locator('#meter')).toContainText('Grenze 35,0 %');
  await expect(page.locator('#meter')).toContainText('Grenze 10,0 %');
  await expect(page.locator('#positions')).toContainText('MSCI World');
  await expect(page.locator('#view')).toHaveText('Ruhiger Markt.');
  await expect(page.locator('#rej')).toContainText('Krypto wäre über 35 %');
  await expect(page.locator('#k-runs')).toHaveText('3');
  await expect(page.locator('#trades')).toContainText('KAUF');
  await expect(page.locator('#notaus-btn')).toBeVisible();
  await expect(page.locator('#push-btn')).toBeVisible();
});

test('Risiko-Coins tragen das Etikett, winzige Kurse bleiben lesbar', async ({ page }) => {
  await supabase(page, { positions: KRYPTO });
  await anmelden(page);
  const zeile = page.locator('#positions tr', { hasText: 'Pepe' });
  await expect(zeile.locator('.tag.risk')).toHaveText('Risiko');
  await expect(page.locator('#positions tr', { hasText: 'Solana' }).locator('.tag')).toHaveText('Altcoin');
  await expect(page.locator('#positions tr', { hasText: 'Bitcoin' }).locator('.tag')).toHaveText('Basis');
  await expect(zeile).toContainText('Kurs 0,000004286 €');
});

test('die älteste Zeile steht im Diagramm links: Läufe werden umgedreht', async ({ page }) => {
  await supabase(page);
  await anmelden(page);
  await expect(page.locator('#k-runs-sub')).toContainText('seit 5. Nov');
});

test('Tab Sparplan zeigt Wert, Rendite, Anteile, Kurse, Kurve und alle Käufe', async ({ page }) => {
  await supabase(page);
  await anmelden(page);
  await page.click('#tabbtn-sparplan');
  await expect(page.locator('#sp-value')).toHaveText(/153,00/);
  await expect(page.locator('#sp-delta')).toContainText('+2,0');
  await expect(page.locator('#k-sp-deposited')).toHaveText(/150,00/);
  await expect(page.locator('#k-sp-units')).toHaveText('2,5');
  await expect(page.locator('#k-sp-avg')).toHaveText(/120,00/); // 300 € für 2,5 Anteile
  await expect(page.locator('#k-sp-price')).toHaveText(/122,00/);
  await expect(page.locator('#chart-sparplan svg')).toBeVisible();
  const zeilen = page.locator('#sp-buys tbody tr');
  await expect(zeilen).toHaveCount(2);
  await expect(zeilen.first()).toContainText('1. Dez');
  await expect(zeilen.nth(1)).toContainText('100,00');
  await expect(zeilen.nth(1)).toContainText('1,5');
});

test('Tab Vergleich: wer vorne liegt, in Euro und in Prozent der Einzahlungen', async ({ page }) => {
  await supabase(page);
  await anmelden(page);
  await page.click('#tabbtn-vergleich');
  await expect(page.locator('#vs-title')).toHaveText('Der Bot liegt vorne');
  await expect(page.locator('#vs-big')).toHaveText(/3,00/);
  await expect(page.locator('#vs-sub')).toContainText('2,0 % der Einzahlungen');
  await expect(page.locator('#chart-vergleich svg')).toBeVisible();
  await expect(page.locator('#chart-lead svg')).toBeVisible();
  await expect(page.locator('#legend-vergleich')).toContainText('Sparplan');
  await page.click('#unit button[data-u="eur"]');
  await expect(page.locator('#hint-vergleich')).toContainText('Euro');
  await expect(page.locator('#legend-vergleich')).toContainText('Eingezahlt');
});

test('Vergleich nennt den Sparplan, wenn er vorne liegt, und Kennzahlen nebeneinander', async ({ page }) => {
  const s = status();
  await supabase(page, { status: [{ ...s, kennzahlen: { ...s.kennzahlen, summary: { ...s.kennzahlen.summary, value: 150, bench: 153 } } }] });
  await anmelden(page);
  await page.click('#tabbtn-vergleich');
  await expect(page.locator('#vs-title')).toHaveText('Der Sparplan liegt vorne');
  const zeile = (n: string) => page.locator('#vs-table tr', { hasText: n });
  await expect(zeile('Wert')).toContainText('150,00');
  await expect(zeile('Wert')).toContainText('153,00');
  await expect(zeile('Rendite')).toContainText('+2,0 %');
  await expect(zeile('Gebühren')).toContainText('0,99');
  await expect(zeile('Gebühren')).toContainText('nur Spread');
  // Gemessen ab dem eingezahlten Geld: 150 → 141 sind 6,0 % beim Bot, 150 → 147 sind 2,0 % beim Sparplan
  await expect(zeile('Größter Rückgang')).toContainText('−6,0 %');
  await expect(zeile('Größter Rückgang')).toContainText('−2,0 %');
});

// Einzahlungen zählen nie als Gewinn und verschieben die Rendite nicht (zeitgewichtet).
// Bot: −5 %, dann 150 € Einzahlung, dann −4 %. Sparplan: +2 %, Einzahlung, +2 %.
const MIT_EINZAHLUNG = [
  { ...RUNS[0], zeit: '2026-12-02T09:15:05+00:00', portfolio_value_eur: 280.8, deposited_eur: 300, benchmark_value_eur: 309.06 },
  { ...RUNS[0], zeit: '2026-12-01T09:15:05+00:00', portfolio_value_eur: 292.5, deposited_eur: 300, benchmark_value_eur: 303 },
  { ...RUNS[0], zeit: '2026-11-06T09:15:05+00:00', portfolio_value_eur: 142.5, deposited_eur: 150, benchmark_value_eur: 153 },
  { ...RUNS[0], zeit: ZEIT, portfolio_value_eur: 150, deposited_eur: 150, benchmark_value_eur: 150 },
];

test('Rendite im Vergleich ist zeitgewichtet: eine Einzahlung ändert sie nicht', async ({ page }) => {
  const s = status({ letzter_lauf: MIT_EINZAHLUNG[0].zeit });
  await supabase(page, { runs: MIT_EINZAHLUNG, status: [{ ...s, kennzahlen: { ...s.kennzahlen, generated_at: MIT_EINZAHLUNG[0].zeit, summary: { ...s.kennzahlen.summary, value: 280.8, bench: 309.06, deposited: 300 } } }] });
  await anmelden(page);
  const e = await ende(page);
  // Bot 0,95 × 0,96 = 0,912. Sparplan 1,02 × 1,02 = 1,0404. Die Einzahlung dazwischen spielt keine Rolle.
  expect(e.pct).toEqual({ v: -8.8, b: 4.04 });
  expect(e.eur).toEqual({ v: 280.8, b: 309.06 });
  const zeile = (n: string) => page.locator('#vs-table tr', { hasText: n });
  await expect(zeile('Rendite')).toContainText('zeitgewichtet');
  await expect(zeile('Rendite')).toContainText('−8,8 %');
  await expect(zeile('Rendite')).toContainText('+4,0 %');
  // Der Gewinn in Euro bleibt Wert minus Einzahlungen, dazu wie in den anderen Tabs in Prozent der Einzahlungen.
  await expect(zeile('Gewinn')).toContainText('% der Einzahlungen');
  await expect(page.locator('#vs-sub')).toContainText('9,4 % der Einzahlungen'); // 28,26 € von 300 €
  await expect(zeile('Gewinn')).toContainText('−19,20 €');
  await expect(zeile('Gewinn')).toContainText('−6,4 %');
  await expect(zeile('Gewinn')).toContainText('+9,06 €');
  await expect(zeile('Gewinn')).toContainText('+3,0 %');
  // Die Tabelle passt aufs iPhone.
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(393);
  // Wert je eingezahltem Euro hätte nur 6,4 % Rückgang gezeigt, weil die Einzahlung den Verlust verdünnt.
  await expect(zeile('Größter Rückgang')).toContainText('−8,8 %');
  await expect(zeile('Größter Rückgang')).toContainText('0,0 %');
  await expect(zeile('Größter Rückgang')).not.toContainText('−0,0');
  await page.click('#unit button[data-u="pct"]');
  await expect(page.locator('#hint-vergleich')).toContainText('Einzahlungen herausgerechnet');
  // In den Tabs Bot und Sparplan steht weiter der Gewinn in Prozent der Einzahlungen.
  await page.click('#tabbtn-bot');
  await expect(page.locator('#delta')).toContainText('−19,20');
  await expect(page.locator('#delta')).toContainText('−6,4 %');
});

test('vor dem ersten Lauf starten beide gleichauf, ohne Fehler', async ({ page }) => {
  const fehler: string[] = [];
  page.on('pageerror', (e) => fehler.push(e.message));
  const s = status({ letzter_lauf: null });
  const leer = { ...s, kennzahlen: { ...s.kennzahlen, summary: { value: 150, cash: 150, deposited: 150, bench: 150, fees_total: 0, api_usd: 0, trades_total: 0, trades_month: 0, runs_total: 0 }, benchmark: { symbol: 'EUNL.DE', units: 0, pending: 150, price: null } } };
  await supabase(page, { status: [leer], kaeufe: [], positions: [], runs: [] });
  await anmelden(page);
  await expect(page.locator('#value')).toHaveText(/150,00/);
  await expect(page.locator('#chart-bot')).toContainText('Noch keine Läufe');
  await page.click('#tabbtn-sparplan');
  await expect(page.locator('#sp-value')).toHaveText(/150,00/);
  await expect(page.locator('#k-sp-deposited-sub')).toContainText('warten auf den nächsten Lauf');
  await expect(page.locator('#sp-buys')).toContainText('Noch keine Käufe');
  await page.click('#tabbtn-vergleich');
  await expect(page.locator('#vs-title')).toHaveText('Gleichauf');
  expect(fehler).toEqual([]);
});

test('Krypto halten gibt es nirgends mehr', async ({ page }) => {
  await supabase(page);
  await anmelden(page);
  for (const tab of ['bot', 'sparplan', 'vergleich']) {
    await page.click(`#tabbtn-${tab}`);
    await expect(page.locator('#app')).not.toContainText('Krypto halten');
  }
  expect(readFileSync('js/app.js', 'utf-8')).not.toMatch(/crypto_benchmark|cbench/);
  expect(readFileSync('js/dashboard.js', 'utf-8')).not.toMatch(/cbench|Krypto halten/);
});

test('Tab-Leiste: wechselt, merkt sich die Wahl und ändert die Adresse', async ({ page }) => {
  await supabase(page);
  await anmelden(page);
  await expect(page.locator('#tabbtn-bot')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#tab-bot')).toBeVisible();
  await expect(page.locator('#tab-sparplan')).toBeHidden();

  await page.click('#tabbtn-vergleich');
  await expect(page.locator('#tab-vergleich')).toBeVisible();
  await expect(page.locator('#tab-bot')).toBeHidden();
  await expect(page.locator('#tabbtn-vergleich')).toHaveAttribute('aria-selected', 'true');
  expect(new URL(page.url()).hash).toBe('#vergleich');
  expect(await page.evaluate(() => localStorage.getItem('tb-tab'))).toBe('vergleich');

  await page.goto('/');
  await expect(page.locator('#tab-vergleich')).toBeVisible();
});

for (const name of ['bot', 'sparplan', 'vergleich']) {
  test(`#${name} ist direkt aufrufbar und schlägt die gemerkte Wahl`, async ({ page }) => {
    await supabase(page);
    await anmelden(page);
    await page.click(name === 'bot' ? '#tabbtn-sparplan' : '#tabbtn-bot');
    await page.goto(`/#${name}`);
    await page.reload();
    await expect(page.locator(`#tab-${name}`)).toBeVisible();
    await expect(page.locator(`#tabbtn-${name}`)).toHaveAttribute('aria-selected', 'true');
  });
}

test('Wechsel der Adresse wechselt den Tab, unbekannte Adresse bleibt beim Bot', async ({ page }) => {
  await supabase(page);
  await anmelden(page);
  await page.evaluate(() => { location.hash = '#sparplan'; });
  await expect(page.locator('#tab-sparplan')).toBeVisible();
  await page.evaluate(() => localStorage.removeItem('tb-tab'));
  await page.goto('/#gibtsnicht');
  await page.reload();
  await expect(page.locator('#tab-bot')).toBeVisible();
});

test('Zeitraum gilt in allen Tabs', async ({ page }) => {
  await supabase(page);
  await anmelden(page);
  await page.click('#range-bot button[data-r="30"]');
  await page.click('#tabbtn-sparplan');
  await expect(page.locator('#range-sparplan button[data-r="30"]')).toHaveAttribute('aria-pressed', 'true');
  await page.click('#tabbtn-vergleich');
  await expect(page.locator('#range-vergleich button[data-r="0"]')).toHaveAttribute('aria-pressed', 'false');
});

test('Tab-Leiste bleibt unten sichtbar, groß genug und lässt Platz für die Safe-Area', async ({ page }) => {
  await supabase(page);
  await anmelden(page);
  const leiste = page.locator('.tabbar');
  const box = await leiste.boundingBox();
  const hoehe = page.viewportSize()!.height;
  expect(Math.round(box!.y + box!.height)).toBe(hoehe);
  for (const t of ['bot', 'sparplan', 'vergleich']) {
    const b = await page.locator(`#tabbtn-${t}`).boundingBox();
    expect(b!.height).toBeGreaterThanOrEqual(44);
  }
  const css = readFileSync('app.css', 'utf-8');
  expect(css).toMatch(/\.tabbar[^}]*env\(safe-area-inset-bottom\)/);
  expect(css).toMatch(/main\.wrap \{ padding-bottom: calc\(var\(--tabbar-h\) \+ env\(safe-area-inset-bottom\)/);
  // Ganz unten verdeckt die Leiste in keinem Tab die letzte Karte oder den Abmelden-Link.
  for (const t of ['bot', 'sparplan', 'vergleich']) {
    await page.click(`#tabbtn-${t}`);
    await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(50);
    const oben = (await leiste.boundingBox())!.y;
    const link = await page.locator('footer [data-abmelden]').boundingBox();
    expect(link!.y + link!.height).toBeLessThanOrEqual(oben);
    const karte = await page.locator(`#tab-${t} .card`).last().boundingBox();
    expect(karte!.y + karte!.height).toBeLessThanOrEqual(oben);
  }
});

test('Mitteilungen öffnen den Tab Bot', () => {
  const sw = readFileSync('sw.js', 'utf-8');
  expect(sw).toContain("'./#bot'");
  expect(sw).toContain('postMessage({ ziel })');
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

const ALLE_KURSE = { preise: { 'EUNL.DE': 140, XBTEUR: 90000, ETHEUR: 3000 }, fehlend: [], zeit: '2026-11-07T13:32:00Z' };

test('Jetzt aktualisieren bewertet das Depot neu und speichert nichts', async ({ page }) => {
  const stand = await supabase(page, { kurse: { body: ALLE_KURSE } });
  await anmelden(page);
  await expect(page.locator('#value')).toHaveText(/156,00/);
  await expect(page.locator('#live-text')).toHaveText('');
  expect(stand.kursAbrufe).toBe(0); // nur auf Knopfdruck

  await page.click('#live-btn');
  // 103,51 € Bargeld + 0,38 Stück × 140 € = 156,71 €
  await expect(page.locator('#value')).toHaveText(/156,71/);
  await expect(page.locator('#delta')).toContainText('6,71');
  await expect(page.locator('#positions')).toContainText('53,20');
  await expect(page.locator('#sp-value')).toHaveText(/350,00/); // 2,5 Anteile × 140 €
  await expect(page.locator('#k-sp-price')).toHaveText(/140,00/);
  await expect(page.locator('#live-text')).toContainText('nicht gespeichert');
  await expect(page.locator('#live-text')).not.toContainText('Ohne aktuellen Kurs');
  expect(stand.schreibzugriffe).toBe(0);
  await expect(page.locator('#k-runs')).toHaveText('3');
  // Pause, damit Yahoo und Kraken nicht dauernd gefragt werden
  await expect(page.locator('#live-btn')).toBeDisabled();
});

test('fehlender Kurs: letzter Wert bleibt und die App sagt es', async ({ page }) => {
  await supabase(page, { kurse: { body: { preise: { XBTEUR: 90000, ETHEUR: 3000 }, fehlend: ['EUNL.DE'], zeit: ALLE_KURSE.zeit } } });
  await anmelden(page);
  await page.click('#live-btn');
  await expect(page.locator('#live-text')).toContainText('Ohne aktuellen Kurs: iShares Core MSCI World');
  await expect(page.locator('#positions')).toContainText('52,49');
  await expect(page.locator('#sp-value')).toHaveText(/153,00/); // Sparplan aus dem letzten Lauf
});

test('Fehler beim Abruf lässt den Stand vom letzten Lauf stehen', async ({ page }) => {
  await supabase(page, { kurse: { code: 500, body: { fehler: 'kaputt' } } });
  await anmelden(page);
  await page.click('#live-btn');
  await expect(page.locator('#live-text')).toContainText('gerade nicht abrufbar');
  await expect(page.locator('#value')).toHaveText(/156,00/);
});

test('Live-Stand bleibt beim Zurückkehren, ein neuerer Lauf ersetzt ihn', async ({ page }) => {
  const stand = await supabase(page, { kurse: { body: ALLE_KURSE } });
  await anmelden(page);
  await page.click('#live-btn');
  await expect(page.locator('#value')).toHaveText(/156,71/);
  const zurueck = () => page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));

  await zurueck();
  await page.waitForTimeout(200);
  await expect(page.locator('#value')).toHaveText(/156,71/);

  stand.status = [status({ letzter_lauf: '2026-11-08T09:15:05+00:00' })];
  await zurueck();
  await expect(page.locator('#live-text')).toHaveText('');
  await expect(page.locator('#value')).toHaveText(/156,00/);
});

test('Trades zeigen Stückzahl und Ausführungskurs', async ({ page }) => {
  await supabase(page);
  await anmelden(page);
  await expect(page.locator('#trades .how')).toContainText('0,38 Stück zu je 130,60 €');
  await expect(page.locator('#trades .how')).toContainText('inkl. Spread');
});

test('unter dem Depotwert steht keine Positionsliste, die Karte zeigt Wert und Kurs', async ({ page }) => {
  await supabase(page, { kurse: { body: ALLE_KURSE } });
  await anmelden(page);
  await expect(page.locator('#holdings')).toHaveCount(0);
  await expect(page.locator('#live-btn')).toBeVisible();
  const zeile = page.locator('#positions tr', { hasText: 'MSCI World' });
  await expect(zeile).toContainText('52,49 €');
  await expect(zeile).toContainText('Kurs 138,13 €'); // 52,49 € / 0,38 Stück
  await page.click('#live-btn');
  await expect(zeile).toContainText('53,20 €');
  await expect(zeile).toContainText('Kurs 140,00 €');
});

test('Zähler gehen auf: ausgeführt und gestoppt ergeben vorgeschlagen', async ({ page }) => {
  await supabase(page);
  await anmelden(page);
  const chips = page.locator('#chips .chip');
  await expect(chips.nth(0)).toHaveText('2vorgeschlagen');
  await expect(chips.nth(1)).toHaveText('1ausgeführt');
  await expect(chips.nth(2)).toHaveText('1von der Risikoprüfung gestoppt');
});

test('Not-Aus im Lauf zählt nicht als gestoppte Order, der Grund bleibt sichtbar', async ({ page }) => {
  await supabase(page, { runs: [{ ...RUNS[0], orders_proposed: 0, orders_executed: 0, rejections: ['Not-Aus in der App aktiv – nichts gehandelt'] }, RUNS[2]] });
  await anmelden(page);
  await expect(page.locator('#chips .chip').nth(2)).toHaveText('0von der Risikoprüfung gestoppt');
  await expect(page.locator('#rej')).toContainText('Not-Aus in der App aktiv');
});

async function ende(page: Page) {
  await page.click('#tabbtn-vergleich');
  await page.click('#unit button[data-u="pct"]');
  const pct = JSON.parse((await page.locator('#chart-vergleich svg').getAttribute('data-ende'))!);
  const balken = Number(await page.locator('#chart-lead svg').getAttribute('data-ende'));
  await page.click('#unit button[data-u="eur"]');
  const eur = JSON.parse((await page.locator('#chart-vergleich svg').getAttribute('data-ende'))!);
  return { pct, balken, eur };
}
const fmt = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt1 = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

test('Kurvenende, letzter Balken, Kopfzeile und Kennzahlen sind identisch', async ({ page }) => {
  await supabase(page);
  await anmelden(page);
  const e = await ende(page);
  expect(e.eur).toEqual({ v: 156, b: 153 });
  expect(e.pct).toEqual({ v: 4, b: 2 });
  expect(e.balken).toBe(3);
  await expect(page.locator('#vs-big')).toHaveText(`${fmt(e.balken)} €`);
  await expect(page.locator('#vs-sub')).toContainText(`${fmt1(e.balken / 150 * 100)} % der Einzahlungen`); // 150 € eingezahlt
  const zeile = (n: string) => page.locator('#vs-table tr', { hasText: n });
  await expect(zeile('Wert')).toContainText(`${fmt(e.eur.v)} €`);
  await expect(zeile('Wert')).toContainText(`${fmt(e.eur.b)} €`);
  await expect(zeile('Rendite')).toContainText(`+${fmt1(e.pct.v)} %`);
  await expect(zeile('Rendite')).toContainText(`+${fmt1(e.pct.b)} %`);
});

test('auch mit Live-Kursen enden Kurve und Balken bei den Zahlen oben', async ({ page }) => {
  await supabase(page, { kurse: { body: ALLE_KURSE } });
  await anmelden(page);
  await page.click('#live-btn');
  await expect(page.locator('#value')).toHaveText(/156,71/);
  const e = await ende(page);
  expect(e.eur).toEqual({ v: 156.71, b: 350 }); // 103,51 € + 0,38 × 140 € und 2,5 × 140 €
  expect(e.balken).toBe(-193.29);
  await expect(page.locator('#vs-big')).toHaveText('193,29 €');
  await expect(page.locator('#vs-title')).toHaveText('Der Sparplan liegt vorne');
  await expect(page.locator('#k-runs')).toHaveText('3'); // Der Live-Punkt zählt nicht als Lauf.
});

test('weicht der gespeicherte Stand vom letzten Lauf ab, stimmen Kurve und Zahlen trotzdem', async ({ page }) => {
  const s = status();
  await supabase(page, { status: [{ ...s, kennzahlen: { ...s.kennzahlen, generated_at: '2026-11-07T15:00:00Z', summary: { ...s.kennzahlen.summary, value: 158, bench: 154 } } }] });
  await anmelden(page);
  const e = await ende(page);
  expect(e.eur).toEqual({ v: 158, b: 154 });
  expect(e.balken).toBe(4);
});

test('Kurven sind gerade Linien zwischen den Läufen', async ({ page }) => {
  await supabase(page);
  await anmelden(page);
  await page.click('#tabbtn-vergleich');
  const pfade = await page.locator('#chart-vergleich svg path').evaluateAll((p) => p.map((e) => e.getAttribute('d')!));
  expect(pfade.length).toBeGreaterThan(0);
  for (const d of pfade) expect(d).toMatch(/^[MLHV0-9.,\s-]+$/);
});

test('Datumsbeschriftungen berühren sich nicht', async ({ page }) => {
  const viele = Array.from({ length: 60 }, (_, i) => ({ ...RUNS[2], zeit: new Date(Date.UTC(2026, 10, 6 + i, 9, 15)).toISOString() })).reverse();
  viele[0] = { ...viele[0], portfolio_value_eur: 156, benchmark_value_eur: 153 };
  await supabase(page, { runs: viele });
  await anmelden(page);
  const pruefe = async (id: string) => {
    const boxen = await page.locator(`${id} text.xlbl`).evaluateAll((t) => t.map((e) => { const r = e.getBoundingClientRect(); return [r.left, r.right]; }));
    expect(boxen.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < boxen.length; i++) expect(boxen[i][0] - boxen[i - 1][1]).toBeGreaterThanOrEqual(8);
  };
  await pruefe('#chart-bot');
  await page.click('#tabbtn-sparplan');
  await pruefe('#chart-sparplan');
  await page.click('#tabbtn-vergleich');
  await pruefe('#chart-vergleich');
  await pruefe('#chart-lead');
});

test('Durchschnittskurs ist Summe der Beträge durch Summe der Anteile', async ({ page }) => {
  const s = status();
  await supabase(page, {
    status: [{ ...s, kennzahlen: { ...s.kennzahlen, benchmark: { ...s.kennzahlen.benchmark, units: 2.31 } } }],
    kaeufe: [{ zeit: ZEIT, symbol: 'EUNL.DE', betrag_eur: 150, kurs_eur: 132.1, anteile: 1.1355 }, { zeit: '2026-11-04T09:15:05+00:00', symbol: 'EUNL.DE', betrag_eur: 150, kurs_eur: 127.6, anteile: 1.1755 }],
  });
  await anmelden(page);
  await page.click('#tabbtn-sparplan');
  await expect(page.locator('#k-sp-avg')).toHaveText(/129,81/);
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
  for (const t of ['bot', 'sparplan', 'vergleich']) {
    await page.click(`#tabbtn-${t}`);
    const breite = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
    expect(breite[0]).toBeLessThanOrEqual(breite[1]);
  }
  await page.click('#tabbtn-bot');
  for (const id of ['#notaus-btn', '#push-btn', '#live-btn']) {
    const box = await page.locator(id).boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }
});

test('alles im Browser trägt das Präfix tb-', async ({ page }) => {
  await supabase(page);
  await anmelden(page);
  await page.click('#tabbtn-vergleich');
  await page.click('#unit button[data-u="eur"]');
  await page.click('#range-vergleich button[data-r="30"]');
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
  await expect(page.locator('#chart-bot svg')).toBeVisible();
  await page.click('#tabbtn-vergleich');
  await expect(page.locator('#chart-vergleich svg')).toBeVisible();
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
