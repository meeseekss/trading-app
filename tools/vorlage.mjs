// Baut dashboard_template.html des Bots aus den Dateien der App, damit beide gleich aussehen.
// Alles zwischen <!-- nur-app --> und <!-- /nur-app --> fehlt dort: Anmeldung, Not-Aus, Mitteilungen, Live-Kurse.
//
//   node tools/vorlage.mjs ../tradingbot/dashboard_template.html
import { readFileSync, writeFileSync } from 'node:fs';

const ziel = process.argv[2];
if (!ziel) throw new Error('Pfad zu dashboard_template.html fehlt');

const koerper = readFileSync('index.html', 'utf-8')
  .match(/<body>([\s\S]*)<\/body>/)[1]
  .replace(/<!-- nur-app -->[\s\S]*?<!-- \/nur-app -->\n?/g, '')
  .replace('<div id="app" hidden>', '<div id="app">')
  .replace(/<noscript>.*<\/noscript>\n?/, '');

const css = readFileSync('app.css', 'utf-8');
const js = readFileSync('js/dashboard.js', 'utf-8')
  .replace('let DATA = null;', 'let DATA = /*__DASHBOARD_DATA__*/null;')
  .replace('export function zeigen', 'function zeigen');

writeFileSync(ziel, `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Trading-Bot – Dashboard</title>
<style>
${css}</style>
</head>
<body>
${koerper.trim()}
<script>
${js}
zeigen(DATA);
</script>
</body>
</html>
`);
