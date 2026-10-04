# ACFS BGS

Tool BGS (Background Simulation di Elite Dangerous) dello squadrone **Alto Comando Flotta Stellare** (ACFS), per la PMF **Flotta Stellare**.

Risponde a una domanda: **dove dobbiamo lavorare oggi?** Mostra in una tabella tutti i sistemi in cui Flotta Stellare è presente, con questi dati:

- fazione che controlla il sistema e grafico dell'influenza di tutte le fazioni presenti;
- influenza di Flotta Stellare e **margine**: vantaggio sulla seconda fazione dove controlliamo, distacco da chi controlla altrove;
- stati in corso o in arrivo: guerra, elezione, ritirata;
- età del dato, cioè quanto tempo fa il sistema è stato aggiornato;
- priorità di intervento, da P1 (massima) a P5;
- architetto e fazione preferita dei sistemi colonizzati;
- distanza da un sistema a scelta: di default Wong Sher, la capitale.

Il tool è pubblicato su **https://flottastellare.it/acfs-bgs/** e si aggiorna da solo ogni ora.

Il progetto è in sviluppo. Le fasi, le decisioni prese e le domande aperte sono in [ROADMAP.md](ROADMAP.md). Le modifiche fatte finora sono in [CHANGELOG.md](CHANGELOG.md).

## Dati

I dati vengono da [Spansh](https://spansh.co.uk). Spansh non accetta chiamate dirette dal browser, quindi lo script `scripts/fetch-bgs.mjs` scarica tutti i sistemi con Flotta Stellare presente e li salva in `public/data/bgs.json`. L'app legge quel file. Il file non è versionato.

Spansh si aggiorna con i dati che i giocatori inviano mentre volano, quindi è sempre un po' indietro rispetto al gioco. I sistemi visitati di rado possono mostrare dati vecchi di giorni o settimane. La colonna "Aggiornato" indica l'età di ogni dato.

## Uso in locale

Serve Node.js 22 o successivo.

```powershell
npm ci
npm start              # http://localhost:4200
```

Al primo avvio `npm start` scarica i dati da Spansh. Gli avvii successivi riusano il file già scaricato. Per aggiornarlo:

```powershell
npm run fetch-data
```

| Comando | Cosa fa |
|---|---|
| `npm start` | Server di sviluppo su `http://localhost:4200`, si ricarica a ogni modifica |
| `npm run fetch-data` | Scarica di nuovo i dati da Spansh |
| `npm run build` | Build di produzione in `dist/acfs-bgs/browser/` |
| `npm run build:pages` | Lo stesso build, per il sito pubblicato sotto `/acfs-bgs/` |
| `npm test` | Test dell'app ([Vitest](https://vitest.dev/)) |
| `npm run test:scripts` | Test degli script e controllo che `src/core/` non dipenda da Angular (`node --test`) |

## Pubblicazione

Il workflow [.github/workflows/pages.yml](.github/workflows/pages.yml) pubblica il sito su GitHub Pages a ogni push su `main`, ogni ora (con dati Spansh freschi) e a mano dalla scheda **Actions** ("Pubblica su GitHub Pages" → "Run workflow"). Il file dei dati non è nel repo: viene scaricato a ogni pubblicazione.

GitHub sospende i workflow orari di un repo pubblico dopo 60 giorni senza commit. Se i dati smettono di aggiornarsi, va riattivato dalla scheda Actions.

## Configurazione

Fazione, capitale e indirizzi di dati, Sheet e Form sono in [src/core/config.json](src/core/config.json). Lo leggono sia l'app sia lo script dei dati.

| Chiave | Significato |
|---|---|
| `faction`, `squadron`, `homeSystem` | Fazione (PMF), squadrone, capitale |
| `conflictMarginPoints` | Sotto questo vantaggio (in punti) un sistema controllato è a rischio di conflitto: la colonna Margine diventa rossa |
| `unregisteredScope` | Come la priorità tratta i sistemi non registrati: `"in-scope"` (nostri: difesa e conquista) oppure `"assumed"` (solo difesa, come i Canonn) |
| `compareFaction` | Seconda fazione da confrontare, per una versione futura (`null`) |
| `architectsSheetUrl`, `watchlistSheetUrl`, `architectFormAction` | Google Sheet e Form dello squadrone (`null` finché non esistono) |

## Struttura

| Cartella | Contenuto |
|---|---|
| `src/core/` | Logica pura: tipi dei dati, priorità, freschezza, stati BGS, registro architetti, export. Niente Angular né API del browser, così la stessa logica può girare anche in Node |
| `src/app/` | L'app Angular: tabella, dialog, caricamento e cache dei dati |
| `scripts/` | Script Node: scaricamento dei dati da Spansh e informazioni di build |

## Crediti e licenza

Il codice deriva da [canonn-colony-operations](https://github.com/canonn-science/canonn-colony-operations) del Canonn Research Group, distribuito con licenza MIT. Il procedimento per scaricare i dati da Spansh segue la loro Cloud Function `canonnbgs` ([Canonn-GCloud](https://github.com/canonn-science/Canonn-GCloud)).

Questo progetto è distribuito con la stessa [licenza MIT](LICENSE), che conserva la nota di copyright originale.
