# Roadmap: ACFS BGS Tool

Tool BGS per lo squadrone **Alto Comando Flotta Stellare** (ACFS) e per la sua PMF **Flotta Stellare**, derivato da [canonn-colony-operations](https://github.com/canonn-science/canonn-colony-operations) (MIT). Punto di partenza: il commit `551a119` del loro branch `main` (il repo dei Canonn è il remote `upstream`), utile per confrontare o recuperare loro correzioni. Le note di analisi iniziali (`HANDOFF.md`) sono state tolte il 6 ottobre 2026 perché superate da questo file: restano nella storia di git.

La domanda a cui il tool deve rispondere ogni giorno dopo il tick: **dove dobbiamo lavorare oggi?**

## Decisioni (4 ottobre 2026)

| Tema | Decisione |
|---|---|
| Fazione | Una sola: `Flotta Stellare`. Si tolgono CDSR e tutte le regole basate su coppie di fazioni |
| Capitale | `Wong Sher` (sistema home e punto di partenza per le distanze) |
| Fonte dati | Spansh, scaricato da uno script e pubblicato come JSON statico. Spansh non manda header CORS, quindi il browser non può chiamarlo direttamente. Lo script fa le stesse operazioni della Cloud Function Canonn (`Canonn-GCloud/query/function/localpackage/canonnbgs.py`) |
| Hosting | Repo `ed-acfs/acfs-bgs-tool` (prima `acfs-bgs`) pubblico, con GitHub Pages su `https://flottastellare.it/acfs-bgs-tool/` (il dominio dell'organizzazione vale anche per i siti dei suoi repo). Organizzazione su piano Free |
| Colonizzazione | Come i Canonn: Form e Sheet ACFS con architetto, appartenenza ad ACFS e fazione preferita, più la Watchlist |
| Lingua | Interfaccia in italiano. Nomi degli stati BGS in inglese, come appaiono in gioco |
| Registro Canonn | Non lo leggiamo, per ora |
| Semafori (5 ottobre 2026) | Due semafori per i sistemi controllati, dal documento "Monitoraggio sistemi Flotta" dello squadrone, con la soglia dell'influenza aggiornata dall'utente: influenza 🟢 ≥ 50%, 🟡 40,0–49,9%, 🔴 < 40%; Margine sulla seconda fazione 🟢 ≥ 30 punti, 🟡 18–29,9, 🔴 < 18 (un'operazione nemica guadagna circa 8 punti al giorno: la zona gialla lascia due giorni per rispondere). Almeno un verde: tranquillo; almeno un rosso: da seguire. Negli Ordini, 🟡 vuol dire anche "ieri nessun punto segnato" e 🔴 "punto perso" (con 🚨 se è grave). La soglia dei 5 punti resta a parte: è quella in cui il gioco fa scattare il conflitto |
| Struttura | La logica pura (tipi, priorità, freschezza, stati) va in un modulo senza Angular, così la usano sia il sito sia l'invio a Discord |
| Discord | In ordine di costo: prima un webhook che invia il report dopo il tick (fase 7), poi un eventuale bot con slash command. Scartata per ora la Discord Activity (il sito dentro Discord, in un iframe) |

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

- [x] Logo ACFS 2025 "Vanguards" (da `ed-acfs.github.io/extras/ACFS_Logo_2025_Vanguards/PNG`, ridotto a 301×340 px; `app/acfs-logo/`, pulsa durante il caricamento) al posto dell'SVG animato Canonn; `<title>`, descrizione, `lang="it"`, favicon e icona Apple dal set `icon-vanguards` del sito; `package.json` già fatto nella 0.1.0
- [x] Testi dell'interfaccia in italiano: tabella, filtri, paginazione, tooltip, errori, dialog "Assegna" e dialog informazioni. Numeri con `LOCALE_ID` `it-IT` ("42,5%"), etichette di freschezza "oggi / 5g / 3s / 1a+", ora di aggiornamento in UTC (ora di gioco)
- [x] La colonna CANO diventa "ACFS" con l'influenza di Flotta Stellare (`factionInfluence`); la colonna CDSR è tolta. Nel grafico Fazioni è evidenziata in arancione la barra di Flotta Stellare
- [x] Nuova colonna **"Margine"** (`computeMargin()` in `core/bgs.ts`), ordinabile, con tooltip sulla fazione di confronto. Verde se il vantaggio è sopra la soglia, rosso sotto (`conflictMarginPoints`, 5 punti), grigio per il distacco nei sistemi che non controlliamo. Al 4 ottobre 2026 l'unico sistema controllato sotto soglia è Lyncis Sector CL-Y d68, a 0,0 punti da Canonn
- [x] Il filtro rapido "Canonn" diventa "Controllati": solo i sistemi controllati da Flotta Stellare
- [x] Export JSON/CSV: `factionInfluence`, `marginPoints`, `marginVersus` al posto di `canonnInfluence` e `cdsrInfluence`
- [x] Corretto un difetto ereditato: i colori delle celle (influenza, margine) erano sovrascritti dal colore generico delle celle e non comparivano mai
- [x] `README.md` e `LICENSE` già aggiornati nella 0.1.0

**Fatto quando:** la tabella è in italiano, con il logo ACFS e una sola colonna di influenza. Raggiunto il 4 ottobre 2026. Restano in inglese, e vanno sistemati nelle fasi successive: le motivazioni della priorità nel tooltip e le icone "Canonn vs Canonn" (fase 4), le opzioni di appartenenza del dialog "Assegna", che sono le risposte del Form Canonn (fase 5).

### 4. Priorità a fazione singola

- [x] `resolveScope()` a fazione singola: in scope se la fazione preferita è Flotta Stellare o il sistema "non è una colonia"; out-of-scope se la fazione preferita è un'altra (accordo da rispettare); "no-preference" se c'è un architetto senza preferenza
- [x] **Politica per i sistemi non registrati** (decisa il 4 ottobre 2026 su una simulazione con i dati reali): sono tutti "nostri" (in scope), quindi si difendono e si spinge per il controllo. È configurabile con `unregisteredScope` in `config.json` (`"in-scope"`, oppure `"assumed"` per la politica Canonn: solo difesa finché il sistema non viene registrato)
- [x] Regole Canonn mantenute come sono: "Nessun architetto assegnato" (101 punti, solo per i sistemi "assumed", quindi inattiva con la politica attuale) e "Ultima su 4+ fazioni" (P1, ora legata all'ambito "nostro" invece che alla preferenza registrata)
- [x] Tolti i trigger a coppia (`canonn-cdsr-close`, `isCanonnOnlyPair`), le icone "Canonn vs Canonn" e `canonn.svg`; i conflitti mostrati sono solo quelli di Flotta Stellare
- [x] Fazione preferita ricavata: Flotta Stellare dove controlla almeno una stazione (289 sistemi su 389), mostrata in grigio
- [x] Motivazioni della priorità in italiano
- [x] `priority.spec.ts` riscritto: test della politica Canonn con `"assumed"` esplicito, più quelli della politica dello squadrone
- [ ] Rivedere soglie e pesi (P1 ≥ 85 … P5) dopo qualche settimana d'uso

**Fatto quando:** l'elenco ordinato per priorità torna con quello che lo squadrone farebbe a mano. Raggiunto il 4 ottobre 2026 per la parte di logica: 17 P1, 5 P2, 16 P3, 23 P4, 328 P5. Le soglie restano quelle dei Canonn finché l'uso non suggerisce di cambiarle.

### 5. Form, Sheet e Watchlist ACFS

- [x] Google Form "ACFS Architect Registry" creato dall'utente il 4 ottobre 2026. Domande: `Your Name`, `System Name`, `Architect Name`, `ACFS Architect` (The Architect is an ACFS Member / Not an ACFS Member / Nobody The System Is Not a Colony / Don't know), `Preferred Faction` (Flotta Stellare + Altro)
- [x] Risposte collegate a uno Sheet, con una seconda scheda `Watchlist` (`System`, `Faction`, `Position`, `Details`); entrambe pubblicate sul web come TSV
- [x] ID dei campi ricavati dal Form pubblicato (`FB_PUBLIC_LOAD_DATA_`) e collegati in `core/architect-form.ts`; URL di Form e TSV in `config.json`
- [x] Risposte di appartenenza ACFS, con etichette italiane nel dialog Assegna; intestazione `ACFS Architect` nel parser
- [x] Prova reale: un invio con gli stessi campi dell'app compare nel foglio pubblicato dopo circa 15 secondi e viene letto dai parser dell'app (riga "PROVA - cancellare questa riga", da cancellare dal foglio)
- [ ] Opzionale: inserire nel nostro registro i 6 sistemi che il registro Canonn assegna a Flotta Stellare
- [x] Formattata la scheda `Watchlist` del foglio il 6 ottobre 2026, con lo stesso viola e le stesse righe alterne della scheda delle risposte (serve il connettore Google Sheets: Drive da solo non modifica le celle). La scheda si chiamava per sbaglio `WatchlistA1` ed è tornata `Watchlist`: il tool la legge per `gid`, quindi il nome non conta. Il foglio è in locale italiano, quindi le formule (anche nelle convalide) separano gli argomenti con `;`. Verificato che il TSV pubblicato, letto come fa il tool, dà solo le righe della Watchlist:
  - tabella A–D più leggibile: intestazione in grassetto, colorata e bloccata; righe alterne; bordi leggeri; larghezze su misura; testo a capo in `Details`; `Position` centrata, con convalida "intero ≥ 1"
  - spiegazione dei quattro campi in una tabellina **a destra** (colonne F–G, staccata da una colonna vuota), non come note sulle intestazioni. Non disturba il parser: cerca le colonne per nome nella prima riga e la prima occorrenza è quella in A–D; le righe senza `System`, `Faction` o `Position` vengono saltate. Testo:
    - **System**: nome del sistema, scritto esattamente come in gioco o su Spansh
    - **Faction**: la fazione da seguire, di solito Flotta Stellare o un alleato da proteggere
    - **Position**: la posizione peggiore che accettiamo per quella fazione nel sistema (1 = prima). Se scende sotto, il sistema sale di priorità nel tool
    - **Details**: il motivo per cui il sistema è in Watchlist. Compare nella scheda del sistema e nell'export

**Fatto quando:** un'assegnazione fatta dal dialog compare nella tabella al ricaricamento successivo. Raggiunto il 4 ottobre 2026 per la catena Form → foglio → app; l'invio dal dialog nel browser va provato una volta dal sito pubblicato.

### 6. Pubblicazione e aggiornamento automatico

- [x] Repo pubblico: lo era già il 4 ottobre 2026. Controllato: nessun dato da non condividere; gli URL di Form e fogli in `config.json` finiscono comunque nel sito pubblicato
- [x] GitHub Pages attivato con sorgente "GitHub Actions" il 4 ottobre 2026; primo deploy riuscito su https://flottastellare.it/acfs-bgs/; dalla 0.6.2 il repo si chiama `acfs-bgs-tool` e il sito è su https://flottastellare.it/acfs-bgs-tool/
- [x] Workflow `.github/workflows/pages.yml` al posto di `main.yml` (Canonn): test (non nelle esecuzioni orarie), dati Spansh freschi, build con `npm run build:pages` (`--base-href /acfs-bgs/`), pubblicazione su Pages
- [x] Esecuzione su push a `main`, **ogni ora** (al minuto 17) e manuale (`workflow_dispatch`). Ogni ora invece che solo al tick, perché Spansh si riempie mano a mano che i giocatori passano nei sistemi. Il JSON non viene committato: viaggia solo nel build
- [x] Sotto il titolo, ora dei dati Spansh e dell'ultimo tick (EDCD Tick Detector, salvato nel JSON come `tick_at`), in UTC
- [x] Cache del registro e della Watchlist nel browser ridotta da 2 ore a 15 minuti
- [x] Progetto Angular rinominato `acfs-bgs-tool`: il build finisce in `dist/acfs-bgs-tool/`
- [x] Provato in locale servendo il build sotto il percorso del sito, come fa GitHub Pages
- [x] Dalla 0.7.0 il controllo dei dati è **ogni 30 minuti** (ai minuti 17 e 47). Lo script `scripts/data-changed.mjs` confronta il download con il `bgs.json` del sito, escluso `generated_at`: se è uguale, il workflow si ferma senza build né deploy. Si pubblica solo quando Spansh ha qualcosa di nuovo
- [x] Dalla 0.7.0, sotto il titolo, contatore dei sistemi aggiornati dopo l'ultimo tick, in totale e fra i P1-P2 (`core/tick-coverage.ts`). La colonna "Aggiornato" resta in giorni, per scelta
- [x] Verificato il 5 ottobre 2026: le esecuzioni programmate senza dati nuovi stampano "Same data as the site" e saltano il deploy; quelle con dati nuovi pubblicano. Però GitHub ne ha eseguite solo 3 in tutta la giornata invece di 48: se servono aggiornamenti più regolari (per esempio per il report della fase 7), valutare un innesco esterno (`workflow_dispatch` da un cron esterno o da un Worker)

**Fatto quando:** il sito è online e si aggiorna da solo.

### 7. Report su Discord

- [ ] Dopo l'aggiornamento, lo stesso workflow confronta i dati nuovi con quelli pubblicati in precedenza (scaricati dal sito stesso) e invia a un webhook: sistemi P1/P2, nuove guerre ed elezioni, ritirate, controlli persi o conquistati
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

### 9. Ordini Ufficiali

Nata da un'idea dell'utente il 5 ottobre 2026, non prevista nelle fasi originarie: comporre nel tool il report giornaliero che lo squadrone scrive a mano su Discord ("ordini ufficiali"), invece di scriverlo da zero ogni volta.

- [x] Pagina `/ordini`, dietro passphrase condivisa (`core/orders-access.ts`, hash in `config.json`): deterrente, non vera protezione, finché non arriva la fase 8
- [x] `core/orders.ts` + `core/order-types.json`: modello e rendering Markdown dello stesso formato già in uso su Discord (sezioni, priorità, icone, stati), con la data di gioco calcolata da sola e il flag "Pending" per uno stato non ancora attivo
- [x] Pulsante "Aggiungi agli ordini" su ogni riga della tabella, con sistema e tipo precompilati dallo stato attuale
- [x] Ricerca sistemi nella pagina Ordini con lo stesso intermediario tipo Spansh della ricerca per distanza, quindi funziona anche per sistemi non presenti nel tool
- [x] Guida rapida in-app (pulsante "Guida" / "Come funziona?")
- [ ] Passphrase reale al posto del placeholder (`cambiami`) prima di condividere il link allo squadrone
- [ ] Vista di sola lettura separata dall'editor (per ora l'anteprima Markdown nella stessa pagina copre il caso d'uso, ma non è "bella" da leggere su mobile)
- [ ] Il carrello non si sincronizza fra i due PC dell'utente (solo `localStorage`, vedi `CLAUDE.md`): da rivedere se diventa un problema nell'uso quotidiano
- [ ] Collegamento con la fase 7 (report Discord automatico) e con l'idea "Pattuglia": oggi sono due strumenti separati, uno manuale (Ordini) e uno da costruire (webhook automatico)

**Fatto quando:** comporre e copiare gli ordini del giorno richiede meno lavoro che scriverli a mano. Da provare nell'uso reale prima di togliere la passphrase placeholder.

## Idee per versioni future

- **Pattuglia ("Da visitare").** Dopo il tick Spansh si aggiorna solo quando un giocatore con un client EDDN (EDMC, EDDiscovery) passa nel sistema, quindi i dati arrivano nel giro di ore. L'unico modo di accelerare è mandarci qualcuno. Idea: una funzione a parte, non una colonna della tabella, con i sistemi P1-P2 ancora fermi a prima dell'ultimo tick, ordinati per priorità e distanza da Wong Sher, da girare ai piloti; anche nel report Discord (fase 7). Il dato c'è già: `core/tick-coverage.ts` sa quali sistemi sono aggiornati dopo il tick. Deciso il 5 ottobre 2026 di tenerla fuori dalla 0.7.0: rientra fra le nuove funzioni del tool ancora da progettare.

- **Punteggio dei conflitti (giorni vinti).** Spansh ed EDSM non lo riportano (verificato il 5 ottobre 2026); ce l'hanno Inara (senza API pubblica per il BGS) ed EliteBGS (`elitebgs.app/api/ebgs/v5/systems`, campo `conflicts`), che però quel giorno rispondeva con errore 500. Idea: lo script dei dati legge il punteggio da EliteBGS solo per i sistemi in guerra o in elezione e lo mostra nella colonna Stato e negli Ordini. **Convenzione: il punteggio si scrive sempre dal punto di vista di Flotta Stellare, nostri giorni prima** (es. "Election 0-2" se l'avversario ha vinto 2 giorni e noi 0), anche se Inara mette prima l'altra fazione.
  - **6 ottobre 2026**: EliteBGS ancora giù. La homepage si carica, ma tutte le chiamate API (`systems`, `factions`, `ticks`) rispondono 500 dopo circa 35 secondi con `connect ECONNREFUSED 127.0.0.1:27017`, cioè il loro MongoDB è fermo. Nel frattempo la 0.9.7 ha aggiunto il riquadro che si apre cliccando le icone della colonna Stato: c'è già il posto per il punteggio (per ora rimanda a Inara; un conflitto in pending mostra "Draw; 0-0"). Quando EliteBGS torna: leggere il campo `conflicts` per i sistemi con `stateEntries` di tipo war/election e mostrarlo lì, nostri giorni prima. Alternativa scartata per ora: il punteggio passa anche su EDDN (journal `FSDJump`, `Conflicts[].Faction1/2.WonDays`), ma servirebbe un ascoltatore sempre acceso, che i cron di GitHub non danno. Inara è esclusa: alle richieste automatiche risponde 503 "Automated scripts or bots are detected from your IP range" (verificato il 6 ottobre 2026 su pagine di sistema, API e termini), e dal browser le regole CORS non lo permetterebbero comunque; il link nel riquadro è l'uso previsto.
  - **Da dove nasce il dato** (spiegato dall'utente, 6 ottobre 2026): lo stato e il punteggio dei conflitti si leggono dai diari di volo (journal) dei giocatori che passano nel sistema; di solito EDMC li invia a Inara (soprattutto) e ad altri servizi. Una fonte utile deve quindi raccogliere quei diari da molti giocatori: per questo EliteBGS (che li riceve via EDDN) va bene e una fonte legata a un solo comandante no.
  - **Companion API di Frontier (CAPI), valutata e scartata il 6 ottobre 2026.** Documentata in [EDCD/FDevIDs](https://github.com/EDCD/FDevIDs) (cartella `Frontier API`; il resto del repo sono tabelle CSV che traducono i codici di Frontier, che a noi non servono perché Spansh dà già i nomi). È un'API ufficiale ma legata al singolo comandante: login OAuth2 con l'account Frontier, app da registrare presso Frontier, e restituisce solo i dati di chi ha fatto il login (profilo, ultimo mercato e cantiere, portaerei, Community Goal, journal). Non esiste un'API pubblica per i dati generali della galassia. Il journal (`/journal`) conterrebbe i `WonDays` negli `FSDJump`, ma solo per i sistemi visitati da chi si è autenticato, non in tempo reale (la documentazione dice di leggerlo a fine sessione), e servirebbero il login di ogni membro dello squadrone e un nostro server per gestire token e dati personali: troppo lavoro per un dato che EliteBGS raccoglie già da tutti.
  - **ETN – Elite Tactical Network ([elite-bgs.store](https://elite-bgs.store/)), valutata e scartata il 6 ottobre 2026.** È una piattaforma per squadroni già pronta (cruscotto, bot Discord, app per i membri, plugin EDMC), alimentata da un ascoltatore EDDN sempre acceso più i diari dei membri e la CAPI. Non è una fonte per noi: gli unici endpoint pubblici (`/api/platform-stats`, `/api/tenants/public`) danno statistiche e l'elenco degli squadroni iscritti; i dati dei sistemi stanno nel cruscotto di ogni squadrone dietro password, senza un'API documentata. Per loro stessa ammissione gira su una connessione Starlink domestica, con disservizi. Usarla vorrebbe dire iscrivere ACFS e affidare a terzi dati strategici, contro la regola di tenerli solo nel foglio Google. Utile solo come conferma che con un ascoltatore EDDN il punteggio si ottiene.
  - **[BGS-Tally](https://github.com/aussig/BGS-Tally) (plugin EDMC), annotato il 6 ottobre 2026.** Da solo non è una fonte per il sito, ma legge già i `WonDays` di ogni conflitto dai diari (`bgstally/activity.py`) e ha un'API per inviare dati a un'applicazione web scelta dall'utente (endpoint `activities` ed `events`, con approvazione esplicita di chi lo usa). Se un giorno avremo un nostro server sempre acceso, i membri che usano già BGS-Tally potrebbero mandarci i punteggi senza installare altro. Da verificare allora cosa contiene esattamente il messaggio `activities`.
  - **Il repository di EliteBGS ([elite-kode/elitebgs](https://github.com/elite-kode/elitebgs)), letto il 6 ottobre 2026.** Il servizio non va considerato affidabile: ultimo commit novembre 2024; la issue [#378](https://github.com/elite-kode/elitebgs/issues/378) (aperta il 5 marzo 2026) riporta lo stesso `ECONNREFUSED 127.0.0.1:27017`, il manutentore risponde che è un problema di infrastruttura che sistema a mano quando glielo segnalano (rimesso in piedi ad aprile, a luglio una richiesta senza risposta); altre issue aperte dicono che il rilevamento del tick è rotto da febbraio 2025. Quindi va usato quando c'è, e il tool deve funzionare anche se sparisce per mesi. Cose utili:
    - **Formato del dato** (`backend/models/ebgs_systems_v5.js`): ogni sistema ha `conflicts[]` con `type` (war, civilwar, election), `status` (active, pending) e `faction1`/`faction2` con `name`, `stake` (la posta in gioco, es. una stazione) e `days_won`.
    - **Ricerca** (`backend/routes/elite_bgs_api/v5/systems.js`): `GET /api/ebgs/v5/systems?name=A&name=B…` accetta più nomi insieme e restituisce 10 sistemi per pagina; i nostri sistemi in conflitto stanno di solito in una richiesta sola.
    - **Errori con codice 200**: secondo la issue #378 l'errore del database a volte arriva con HTTP 200; va controllato il contenuto (`docs` presente), non solo il codice.
    - **Licenza Apache 2.0**, con un ascoltatore EDDN già scritto (`eddn_listener/`), che però lavora su tutta la galassia con MongoDB: per noi basterebbe un ascoltatore molto più piccolo limitato ai nostri sistemi.
  - L'utente sta cercando altre fonti.

- **Un'app nostra sul web (da valutare, 6 ottobre 2026).** Oggi il tool è un sito statico su GitHub Pages più un workflow che scarica i dati. Un piccolo servizio nostro sempre acceso aprirebbe varie strade: un ascoltatore EDDN limitato ai nostri sistemi (punteggio dei conflitti senza dipendere da EliteBGS), la ricezione dei dati dall'API di BGS-Tally, dati più freschi di Spansh, il typeahead della fase 8. Da decidere: dove ospitarlo, quanto costa, chi lo mantiene. Vedi anche la voce "Una nostra API, invece del JSON statico" più sotto.

- **Seconda PMF da confrontare.** Una fazione opzionale in configurazione (alleata o rivale), con una sua colonna di influenza nei sistemi in cui è presente insieme a Flotta Stellare. Solo per confronto visivo: non entra nel calcolo della priorità. Il dato c'è già, perché `minor_faction_presences` elenca tutte le fazioni del sistema. Per prepararla, nella fase 2 la configurazione prevede un campo `compareFaction`, vuoto per default.

- **Una nostra API, invece del JSON statico.** Verificato il 5 ottobre 2026 sul codice dei Canonn: la loro Cloud Function `canonnbgs` ([Canonn-GCloud](https://github.com/canonn-science/Canonn-GCloud), `query/function/localpackage/canonnbgs.py`) non ha un database proprio, è solo un proxy/cache di Spansh (stessa ricerca salvata e richiamata a pagine che fa il nostro `fetch-bgs.mjs`, con TTL di un'ora) — lato server invece che in CI. Il MySQL visibile nello stesso repo serve a un tool diverso, [EDMC-Canonn](https://github.com/canonn-science/EDMC-Canonn) ("Project Athens"), che raccoglie dati scientifici dai client dei giocatori via EDDN: non è comparabile, perché aggrega da molti client in continuo, mentre il BGS lavora su Spansh. Se un giorno vogliamo un'API nostra (ad esempio per il typeahead della fase 8, o per dati più freschi di Spansh), la scelta è fra queste due strade molto diverse: un proxy leggero come il loro (piccolo passo da quello che abbiamo) oppure un ascoltatore EDDN con database proprio (molto più lavoro, serve solo se Spansh non basta più).

## Domande aperte

1. **Tick.** I Canonn non rilevano il tick: approssimano i tick trascorsi con i giorni passati da `updated_at` (`freshness.ts`). Per noi c'è `https://tick.edcd.io/api/tick` (EDCD Tick Detector), che restituisce l'ora dell'ultimo tick, è pubblico e ammette chiamate dal browser (`Access-Control-Allow-Origin: *`). Proposta: il workflow lo controlla ogni 30 minuti e aggiorna i dati quando vede un tick nuovo, più alcuni aggiornamenti nelle ore successive, perché Spansh si riempie man mano che i giocatori visitano i sistemi. Il report Discord parte una volta per tick, dopo un ritardo ancora da decidere. In parte fatto nella 0.7.0: controllo ogni 30 minuti con pubblicazione solo se i dati cambiano, e contatore dei sistemi aggiornati dopo il tick. Resta da decidere quando parte il report: idea, quando è aggiornata una certa quota dei P1-P2, oppure dopo un tempo massimo. Da verificare: quale servizio usa il bot che oggi vi avvisa del tick su Discord.
2. ~~**Fazione preferita ricavata in automatico.**~~ Deciso nella fase 4: Flotta Stellare dove controlla almeno una stazione.
3. **Canale Discord** di destinazione del report, e chi crea il webhook.
4. **Freschezza del dato.** Spansh e Inara sono in ritardo rispetto al gioco (vedi i conteggi del sito). Il tool deve dirlo chiaramente e non presentare i dati come autorevoli.
