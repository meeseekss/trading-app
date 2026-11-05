# Trading Bot – Web-App

Zeigt den Stand des [Trading-Bots](https://github.com/meeseekss/tradingbot) (privates Repository) als App fürs iPhone: https://meeseekss.github.io/trading-app/

Reines HTML, CSS und JavaScript ohne Build-Schritt. Hier liegen nur Code und öffentliche Werte, keine Daten und keine Geheimnisse. Die Daten kommen nach der Anmeldung aus Supabase und sind durch die Zugriffsregeln in der Datenbank geschützt.

```
index.html, app.css     Oberfläche, Gestaltung aus dem Dashboard des Bots
js/dashboard.js         Darstellung und Diagramme, aus dashboard_template.html übernommen
js/app.js               Anmeldung, Daten, Not-Aus, Mitteilungen
js/konfig.js            Supabase-URL, anon-Schlüssel, öffentlicher VAPID-Schlüssel
sw.js, manifest.webmanifest, icons/   Installation auf dem Home-Bildschirm und Offline-Start
tools/icons.mjs         erzeugt die Icons
tests/app.spec.ts       Tests gegen eine nachgestellte Supabase
```

Der Knopf „Jetzt aktualisieren“ bewertet das Depot zu aktuellen Kursen (Edge Function `kurse` im Bot-Repository). Das ist nur eine Anzeige im Arbeitsspeicher: Es wird nichts gespeichert und nicht gehandelt, und die Kurven zeigen weiter die täglichen Läufe.

Alle Namen im Browser (localStorage, Caches, Sitzung) beginnen mit `tb-`, weil auf derselben Domain auch andere Apps liegen. Der Service Worker löscht nur Caches mit diesem Präfix.

## Tests

```bash
npm install
npx playwright install chromium
npm test
```

Jeder Push auf `main` veröffentlicht die App über GitHub Pages.
