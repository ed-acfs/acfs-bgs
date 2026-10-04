# Roadmap: tool BGS di Alto Comando Flotta Stellare

Tool BGS per lo squadrone **Alto Comando Flotta Stellare** (ACFS) e per la sua PMF **Flotta Stellare**, derivato da [canonn-colony-operations](https://github.com/canonn-science/canonn-colony-operations) (MIT). Il contesto di partenza è in `HANDOFF.md`.

La domanda a cui il tool deve rispondere ogni giorno dopo il tick: **dove dobbiamo lavorare oggi?**

## Decisioni (4 ottobre 2026)

| Tema | Decisione |
|---|---|
| Fazione | Una sola: `Flotta Stellare`. Si tolgono CDSR e tutte le regole basate su coppie di fazioni |
| Capitale | `Wong Sher` (sistema home e punto di partenza per le distanze) |
| Fonte dati | Spansh, scaricato da uno script e pubblicato come JSON statico. Spansh non manda header CORS, quindi il browser non può chiamarlo direttamente. Lo script fa le stesse operazioni della Cloud Function Canonn (`Canonn-GCloud/query/function/localpackage/canonnbgs.py`) |
| Hosting | Repo `ed-acfs/acfs-bgs` pubblico (lo è già: l'handoff lo dava privato), con GitHub Pages su `https://ed-acfs.github.io/acfs-bgs/`. Organizzazione su piano Free |
| Colonizzazione | Come i Canonn: Form e Sheet ACFS con architetto, appartenenza ad ACFS e fazione preferita, più la Watchlist |
| Lingua | Interfaccia in italiano. Nomi degli stati BGS in inglese, come appaiono in gioco |
| Registro Canonn | Non lo leggiamo, per ora |
| Struttura | La logica pura (tipi, priorità, freschezza, stati) va in un modulo senza Angular, così la usano sia il sito sia l'invio a Discord |

## Fasi

Ogni fase si chiude con qualcosa da vedere o provare, su un branch, prima di fare il merge su `main`.

### 0. Preparazione

- [x] `gh auth login` su questo PC (4 ottobre 2026)
- [x] Disattivato il workflow upstream "Deploy static content to Pages" fino alla fase 6. Prima di essere disattivato aveva fallito solo al passo "Setup Pages", perché Pages non è attivo: installazione, test e build passano anche sui runner di GitHub
- [x] `src/app/build-info.ts` tolto dal versionamento
- [ ] `angular.json` (`analytics: false`): modifica locale, per ora non committata

### 1. Dati Flotta Stellare nell'app

- [x] Script Node `scripts/fetch-bgs.mjs` (`npm run fetch-data`) che:
  - salva la ricerca su Spansh (`/api/systems/search/save`, filtro `minor_faction_presences` = Flotta Stellare);
  - scarica le pagine da 500 (`/recall/{ref}/{page}`);
  - toglie bodies, synthesis_recipes e il dettaglio delle stazioni;
  - calcola il numero di stazioni (Fleet Carrier escluse) e un elenco sintetico di tutte le stazioni (`assets`), che compare nel dialog del sistema;
  - scrive `public/data/bgs.json` (circa 950 kB, escluso dal versionamento) con data di generazione e conteggio dei sistemi.
- [x] `npm start` e `npm run build` scaricano i dati solo se il file manca (`--if-missing`)
- [x] `canonn-bgs.service.ts` legge il JSON statico al posto della Cloud Function, con un solo fetch e senza token o pagine
- [x] Sheet e Form Canonn scollegati: nessuna lettura del loro registro e invio dal dialog Assign bloccato finché non c'è il nostro Form (fase 5)
- [x] Test: `npm run test:scripts` per lo script, `canonn-bgs.service.spec.ts` riscritto per il JSON statico
- [ ] Typeahead per la distanza: per ora resta l'intermediario pubblico dei Canonn (`query/typeahead`), che copre tutta la galassia. Da sostituire quando avremo un nostro intermediario (fase 8, Worker)

**Fatto quando:** `npm start` mostra i circa 389 sistemi di Flotta Stellare con stati e freschezza del dato. Raggiunto il 4 ottobre 2026: 389 sistemi, 249 controllati. L'influenza di Flotta Stellare compare con le fasi 3–4, perché le colonne CANO/CDSR e i test della priorità sono scritti per i nomi Canonn.

### 2. Modulo `core` senza Angular

- [x] `src/core/`: i file di `data/` più `bgs.ts`, che contiene tipi, `toBgsRow()` (era `toRow()` del service), `summarizeFactionState()` e il resto della logica pura del service. Il service passa da circa 1.050 a circa 460 righe e fa solo caricamento e cache
- [x] Separate le parti legate al browser: lo scaricamento dei file di export va in `app/export-download.ts`, `your-name.ts` (localStorage) in `app/`; il logger non usa più `isDevMode` di Angular, lo attiva `main.ts`
- [x] `src/core/config.json` (con i tipi in `config.ts`): squadrone, fazione, capitale, `compareFaction` (vuoto), soglia del margine (5 punti), prefisso `acfs-bgs:` per `localStorage`, URL di dati, typeahead, Sheet e Form. Lo legge anche `scripts/fetch-bgs.mjs`, quindi il nome della fazione è scritto in un posto solo
- [x] `scripts/core-purity.test.mjs`: fallisce se in `src/core/` compaiono import di Angular o dell'app, DOM o `localStorage`
- [x] Fine riga LF in tutti i sorgenti, `priority.ts` compreso
- [x] Distanza misurata di default da Wong Sher, se è nel dataset
- [x] Service rinominato: `CanonnBgsService` → `BgsService` (`app/bgs.service.ts`)

**Fatto quando:** i test passano e la logica pura non dipende da Angular. Raggiunto il 4 ottobre 2026. Restano riferimenti ai Canonn che sono *comportamento*, non struttura: costanti `CANONN_FACTION`/`CDSR_FACTION` e logica a due fazioni in `bgs.ts` e `priority.ts` (fase 4), testi, colonne e logo (fase 3), ID dei campi del Form (fase 5).

### 3. Identità e italiano

- [x] Logo ACFS (`app/acfs-logo/`, pulsa durante il caricamento) al posto dell'SVG animato Canonn; `<title>`, descrizione, `lang="it"`, favicon e icona Apple dal set `icon-vanguards` del sito; `package.json` già fatto nella 0.1.0
- [x] Testi dell'interfaccia in italiano: tabella, filtri, paginazione, tooltip, errori, dialog "Assegna" e dialog informazioni. Numeri con `LOCALE_ID` `it-IT` ("42,5%"), etichette di freschezza "oggi / 5g / 3s / 1a+", ora di aggiornamento in UTC (ora di gioco)
- [x] La colonna CANO diventa "ACFS" con l'influenza di Flotta Stellare (`factionInfluence`); la colonna CDSR è tolta. Nel grafico Fazioni è evidenziata in arancione la barra di Flotta Stellare
- [x] Nuova colonna **"Margine"** (`computeMargin()` in `core/bgs.ts`), ordinabile, con tooltip sulla fazione di confronto. Verde se il vantaggio è sopra la soglia, rosso sotto (`conflictMarginPoints`, 5 punti), grigio per il distacco nei sistemi che non controlliamo. Al 4 ottobre 2026 l'unico sistema controllato sotto soglia è Lyncis Sector CL-Y d68, a 0,0 punti da Canonn
- [x] Il filtro rapido "Canonn" diventa "Controllati": solo i sistemi controllati da Flotta Stellare
- [x] Export JSON/CSV: `factionInfluence`, `marginPoints`, `marginVersus` al posto di `canonnInfluence` e `cdsrInfluence`
- [x] Corretto un difetto ereditato: i colori delle celle (influenza, margine) erano sovrascritti dal colore generico delle celle e non comparivano mai
- [x] `README.md` e `LICENSE` già aggiornati nella 0.1.0

**Fatto quando:** la tabella è in italiano, con il logo ACFS e una sola colonna di influenza. Raggiunto il 4 ottobre 2026. Restano in inglese, e vanno sistemati nelle fasi successive: le motivazioni della priorità nel tooltip e le icone "Canonn vs Canonn" (fase 4), le opzioni di appartenenza del dialog "Assegna", che sono le risposte del Form Canonn (fase 5).

### 4. Priorità a fazione singola

- [ ] `resolveScope()`: in scope se la fazione preferita è Flotta Stellare o se il sistema "non è una colonia"; out-of-scope se la fazione preferita è un'altra (accordo da rispettare); "assumed" se il registro non dice nulla
- [ ] Togliere i trigger a coppia (`canonn-cdsr-close`, `isCanonnOnlyPair`) e le icone "Canonn contro Canonn"
- [ ] Rivedere con lo squadrone soglie e pesi (P0 ≥ 85 … P4), partendo da qualche caso reale
- [ ] Riscrivere `priority.spec.ts` sui nuovi casi

**Fatto quando:** l'elenco ordinato per priorità torna con quello che lo squadrone farebbe a mano.

### 5. Form, Sheet e Watchlist ACFS

- [ ] Creazione del Google Form (a cura dell'utente). Titoli delle domande: `Your Name`, `System Name`, `Architect Name`, `ACFS Architect` (The Architect is an ACFS Member / Not an ACFS Member / Nobody The System Is Not a Colony / Don't know), `Preferred Faction` (Flotta Stellare + Altro)
- [ ] Risposte collegate a uno Sheet, con una seconda scheda `Watchlist` (colonne `System`, `Faction`, `Position`, `Details`), entrambe pubblicate sul web come TSV
- [ ] Collegare nell'app gli ID dei campi del Form e gli URL dei TSV
- [ ] Opzionale: inserire nel nostro registro, a mano, i 6 sistemi che i Canonn già indicano come preferiti di Flotta Stellare

**Fatto quando:** un'assegnazione fatta dal dialog compare nella tabella al ricaricamento successivo.

### 6. Pubblicazione e aggiornamento automatico

- [x] Repo pubblico: lo era già il 4 ottobre 2026. Prima di attivare Pages controllare comunque che non contenga dati da non condividere
- [ ] Attivare GitHub Pages con sorgente "GitHub Actions"
- [ ] Workflow unico: scarica i dati da Spansh, esegue i test, fa il build con `--base-href /acfs-bgs/` e pubblica su Pages
- [ ] Esecuzione schedulata (alcune volte al giorno, per coprire il tick) e manuale (`workflow_dispatch`). Il JSON non viene committato: viaggia solo nel build
- [ ] Mostrare nella pagina l'ora dell'ultimo aggiornamento

**Fatto quando:** il sito è online e si aggiorna da solo.

### 7. Report su Discord

- [ ] Dopo l'aggiornamento, lo stesso workflow confronta i dati nuovi con quelli pubblicati in precedenza (scaricati dal sito stesso) e invia a un webhook: sistemi P0/P1, nuove guerre ed elezioni, ritirate, controlli persi o conquistati
- [ ] URL del webhook nei Secrets del repo (`DISCORD_WEBHOOK_URL`)
- [ ] In seguito: bot con slash command per interrogare (`/bgs sistema`, `/bgs priorità`) e per aggiornare (assegnare architetto o fazione preferita, aggiungere alla Watchlist). Aggiornare vuol dire scrivere nello Sheet, quindi serve un servizio sempre acceso con le credenziali Google: va progettato insieme alla fase 8

**Fatto quando:** dopo il tick arriva un messaggio sul canale scelto.

### 8. Accesso ristretto (in seguito)

Il tool contiene strategia di gioco: accordi, fazione preferita, motivazioni della Watchlist. Su GitHub Pages è visibile a chiunque. I Canonn non proteggono nulla: sito, repo, Sheet e Form sono pubblici, e le note della loro Watchlist si leggono senza login.

Da proteggere sono **lo Sheet e le sue note**, non i dati Spansh (chiunque può interrogare Spansh):

- [ ] Spostare l'hosting su Cloudflare Pages con Cloudflare Access, gratuito fino a 50 utenti. Login con codice via email, account GitHub o Google. Il repo può tornare privato. In alternativa, login con Discord e controllo del ruolo nel server ACFS tramite un Cloudflare Worker: più lavoro, ma l'accesso segue i ruoli Discord
- [ ] Togliere la pubblicazione sul web dello Sheet: lo legge il workflow o il Worker, con un account di servizio Google le cui credenziali stanno nei Secrets
- [ ] Valutare se sostituire il Google Form con un endpoint del Worker, così solo chi ha fatto login può scrivere

Già dalle fasi 1–7 vale una regola: niente dati strategici nel repo. Lo Sheet si legge per URL configurabile, così passare alla fase 8 non richiede di riscrivere l'app.

## Idee per versioni future

- **Seconda PMF da confrontare.** Una fazione opzionale in configurazione (alleata o rivale), con una sua colonna di influenza nei sistemi in cui è presente insieme a Flotta Stellare. Solo per confronto visivo: non entra nel calcolo della priorità. Il dato c'è già, perché `minor_faction_presences` elenca tutte le fazioni del sistema. Per prepararla, nella fase 2 la configurazione prevede un campo `compareFaction`, vuoto per default.
## Domande aperte

1. **Tick.** I Canonn non rilevano il tick: approssimano i tick trascorsi con i giorni passati da `updated_at` (`freshness.ts`). Per noi c'è `https://tick.edcd.io/api/tick` (EDCD Tick Detector), che restituisce l'ora dell'ultimo tick, è pubblico e ammette chiamate dal browser (`Access-Control-Allow-Origin: *`). Proposta: il workflow lo controlla ogni 30 minuti e aggiorna i dati quando vede un tick nuovo, più alcuni aggiornamenti nelle ore successive, perché Spansh si riempie man mano che i giocatori visitano i sistemi. Il report Discord parte una volta per tick, dopo un ritardo ancora da decidere. Da verificare: quale servizio usa il bot che oggi vi avvisa del tick su Discord.
2. **Fazione preferita ricavata in automatico.** I Canonn la ricavano dalle stazioni con "canonn" nel nome. Per noi la regola potrebbe essere "Flotta Stellare controlla almeno una stazione nel sistema", oppure nessuna regola. Da decidere nella fase 4.
3. **Canale Discord** di destinazione del report, e chi crea il webhook.
4. **Freschezza del dato.** Spansh e Inara sono in ritardo rispetto al gioco (vedi i conteggi del sito). Il tool deve dirlo chiaramente e non presentare i dati come autorevoli.
