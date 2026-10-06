# Changelog

Tutte le modifiche rilevanti di questo progetto sono documentate in questo file.

## [0.9.5] - 2026-10-06 — Tabella leggibile su telefono

### Interfaccia mobile

- Sotto i 720 px di larghezza ogni sistema diventa una **scheda**: nome in alto, poi i valori con la loro etichetta, in quest'ordine: Priorità, Aggiornato, Distanza; ACFS, Margine, Stato; fazione di controllo e grafico delle fazioni; architetto e fazione preferita. Prima la tabella era larga più di 1100 px e su un telefono si vedevano solo Sistema e Distanza, il resto andava scorso in orizzontale.
- Le intestazioni ordinabili diventano una fila di pulsanti **"Ordina per"** sopra le schede, con lo stesso indicatore ▲/▼.
- Sotto i 600 px: titolo e logo affiancati, i pulsanti Guida, Legenda, Ordini ed Esporta in una griglia (2×2 su telefono); nel paginatore la pagina corrente sta sopra e i due pulsanti affiancati sotto.
- **Ordini Ufficiali**: su telefono i campi (intestazione, barra "Aggiungi riga", righe) occupano tutta la larghezza invece di avere larghezze miste; la Firma tiene accanto il pulsante Blocca. L'anteprima Markdown non sborda più a destra (era larga il 100% più il suo margine interno, anche su desktop).
- Su desktop non cambia nulla, a parte l'anteprima Markdown che ora resta dentro la pagina.

## [0.9.4] - 2026-10-06 — Ordinamento per nome

### Tabella

- Anche l'intestazione **Sistema** ordina la tabella: alfabetico per nome del sistema, senza distinguere maiuscole e minuscole; un secondo clic inverte l'ordine. Era l'unica colonna, insieme a Stato, che non si poteva ordinare.

### Test

- Nuovo test: ordinamento per nome dall'intestazione, nei due versi. Passano 210 test dell'app.

## [0.9.3] - 2026-10-06 — Fazione preferita senza architetto

### Registro

- Nel dialog "Assegna" il nome dell'architetto è obbligatorio solo se l'appartenenza dice chi è ("L'architetto è un membro ACFS" o "Non è un membro ACFS"). Con "Non so" si può lasciare vuoto, così si registra la fazione preferita di un sistema di cui nessuno conosce l'architetto. Prima era obbligatorio per tutte le risposte tranne "Nessuno: il sistema non è una colonia", anche se il Google Form non lo richiede.
- Il messaggio di errore suggerisce "Non so" invece di "Nobody", che nel menu non compare.

### Test

- Nuovi test del dialog: invio con la sola fazione preferita, nome obbligatorio con le due risposte sull'appartenenza. Passano 209 test dell'app.

## [0.9.2] - 2026-10-05 — Watchlist in cima

### Tabella

- I sistemi della **Watchlist** sono sempre in cima, poi tutti gli altri nell'ordine di Spansh (dal più aggiornato). Prima l'ordine era solo quello di Spansh, e un sistema della Watchlist poteva finire in fondo. Cliccando un'intestazione si ordina comunque per quella colonna.

## [0.9.1] - 2026-10-05 — Colonna Distanza

### Tabella

- Nuova colonna **Distanza**, in anni luce, dal sistema scritto nel box "Distanza da" (Wong Sher finché non se ne cerca un altro). Cliccando l'intestazione si ordina per distanza, come col pulsante di ricerca. Il sistema di riferimento resta quello cercato anche se poi si ordina per un'altra colonna (prima seguiva la prima riga dell'ordinamento).
- Celle della tabella un po' più strette (10 px ai lati invece di 14), così con la colonna in più la tabella entra ancora senza scorrere in orizzontale.
- L'ordine predefinito resta quello di Spansh: dal sistema aggiornato più di recente.

## [0.9.0] - 2026-10-05 — Semafori, legenda e editor degli ordini

### Interfaccia

- Nella colonna Stato la guerra si indica con ⚔️, la stessa icona degli Ordini Ufficiali, invece che con 🔫.
- **Semafori dello squadrone** sulle colonne ACFS e Margine, nei sistemi che controlliamo (`core/semaphore.ts`, soglie in `config.json`): influenza 🟢 dal 50%, 🟡 da 40,0 a 49,9%, 🔴 sotto il 40%; Margine 🟢 da 30 punti, 🟡 da 18 a 29,9, 🔴 sotto 18. Almeno un verde: sistema tranquillo; almeno un rosso: da seguire. Il vantaggio sotto i 5 punti (rischio di conflitto per il controllo) resta segnalato a parte, con ⚠️ e in grassetto. Dove non controlliamo l'influenza resta arancione e il Margine grigio.
- Nuovo pulsante **Legenda** nell'intestazione: apre sopra la tabella un pannello che spiega colori e icone (età del dato, stati, priorità, influenza e margine, icone del sistema e dell'architetto). Gli esempi usano gli stessi stili della tabella.

### Ordini Ufficiali

- Il link diretto a https://flottastellare.it/acfs-bgs-tool/ordini dava 404 (si arrivava alla pagina solo dal pulsante della tabella): ora il build per il sito copia `index.html` in `404.html` (`scripts/spa-fallback.mjs`), così GitHub Pages carica l'app e il router apre la pagina giusta.
- Si sceglie la **data degli ordini**: per default è domani (di solito gli ordini si scrivono oggi per domani), con la data di gioco mostrata sotto il campo. Una data scelta resta finché non è passata.
- I pulsanti di stato erano scritti in nero su sfondo scuro e non si leggevano: ora hanno il colore del testo e lo stato attivo è evidenziato.
- Nell'editor stati, tendenze e tipi si vedono come emoji (🆕 🟢 🚨 ✅ ❌, ⬆️ ⬇️ ↔️, 🗳️ ⚔️ 📊 🏗️) invece che come codici Discord. Il testo da copiare usa ancora i codici, che servono per le emoji del server (`:RedAlert:`, `:Expansion:`).
- Nuovi stati 🟡 (`:yellow_circle:`, risultato insoddisfacente: nessun punto segnato ieri, influenza sotto il 49%) e 🔴 (`:red_circle:`, risultato negativo: punto perso, influenza sotto il 39,9%; se è grave si abbina a 🚨).
- Una riga di influenza aggiunta dalla tabella ha già lo stato del semaforo dell'influenza (🟢, 🟡 o 🔴), da correggere a mano se serve.
- Con ✅ o ❌ la riga passa da sola nelle **Operazioni concluse** (e torna indietro se si toglie la spunta). I due stati si escludono a vicenda.
- **Note & informazioni** raccoglie testo libero ("+ Nota libera") e tutto ciò che è in **Pending**: le guerre e le elezioni con punteggio "Draw; 0-0" e 🆕 (togliendo la spunta Pending tornano fra le Operazioni) e le Expansion, con il pulsante **+ Expansion** (riga "Pending Expansion da ? - Sistema di arrivo: ?" da completare). Il pulsante **Precompila con i pending** aggiunge dai dati tutte le guerre e le elezioni in pending, senza doppioni. Le Expansion non si ricavano dai dati: Spansh mostra l'Expansion in pending in quasi tutti i nostri sistemi (189 su 389), quindi "Aggiungi agli ordini" non le considera più e propone una spinta d'influenza.
- Con "Aggiungi riga", un'Expansion con un sistema scelto diventa subito "Pending Expansion da **sistema** - Sistema di arrivo: **?**" 🆕, con la spunta Pending; una Nota libera con un sistema parte dal nome in grassetto. La spunta Pending c'è anche per le Expansion e cambia il testo fra "Pending Expansion" ed "Expansion". Una riga vuota a cui si cambia il tipo in Expansion si precompila allo stesso modo.
- Le righe dei cantieri usano l'emoji 🏗️ direttamente nel testo copiato (prima `:construction_site:`). Scegliendo una sezione in "Aggiungi riga" il tipo si adegua: Cantieri aperti → Cantiere, Note → Nota libera, Operazioni → Elezione.
- Le quattro sezioni dell'editor sono sempre visibili, ciascuna con il suo colore (arancione, azzurro, giallo, verde) e il numero di righe.
- Il punteggio di un conflitto si scrive sempre dal nostro punto di vista, con i nostri giorni prima (es. "Close Defeat; 0-2").

## [0.8.0] - 2026-10-05 — Ordini Ufficiali e titolo 1.0

### Ordini Ufficiali

- Nuova pagina **`/ordini`**, dietro passphrase condivisa (deterrente, non vera protezione, finché non arriva la fase 8): compone il report giornaliero delle operazioni, con le stesse sezioni e la stessa formattazione del messaggio che lo squadrone già posta su Discord (Operazioni per priorità, Cantieri Aperti, Note & Informazioni, Operazioni Concluse).
- Tipi di attività (Elezione, Guerra, Spinta influenza, Cantiere, Expansion da monitorare, Nota libera) definiti in `core/order-types.json`, non nel codice: per aggiungerne uno nuovo basta modificare il file.
- La data del report è quella di gioco (anno reale + 1286, come fa già lo squadrone a mano), calcolata da sola.
- Nuovo flag **"Pending"** per un'elezione o una guerra non ancora attiva (dura 1 giorno fino al tick successivo) o un'expansion non ancora conclusa (fino a 3 giorni); nuova freccia di tendenza **stabile** (↔) per un cambiamento di 0-1%.
- Pulsante **"Aggiungi agli ordini"** su ogni riga della tabella: precompila sistema e tipo dallo stato attuale (guerra, elezione, expansion, o l'influenza corrente se nessuno dei tre è in corso).
- Il carrello resta solo nel browser (`localStorage`): non si sincronizza fra i due computer dell'utente (vedi `CLAUDE.md`).
- Nuovo pulsante **Guida** (anche nella pagina Ordini, "Come funziona?"): apre una breve spiegazione del tool e di come comporre gli ordini.

### Titolo

- Il tool si presenta come **"ACFS BGS Tool 1.0"** (titolo della pagina e intestazione), per segnare l'avvicinamento alla produzione.

### Test

- Nuovi test per il modello e il rendering degli ordini (`core/orders.spec.ts`, `core/orders-access.spec.ts`). Passano 175 test dell'app.

## [0.7.0] - 2026-10-05 — Controllo dei dati ogni 30 minuti e contatore del tick

### Aggiornamento dei dati

- Il workflow controlla i dati Spansh **ogni 30 minuti** (ai minuti 17 e 47) invece che ogni ora.
- Nuovo script `scripts/data-changed.mjs`: confronta il download con il `bgs.json` già pubblicato, ignorando l'ora del download e l'ordine dei sistemi. Se non è cambiato niente, l'esecuzione si ferma prima di installare, compilare e pubblicare; se il sito non risponde, pubblica comunque. Push su `main` ed esecuzioni manuali pubblicano sempre.

### Interfaccia

- Sotto il titolo, nuovo contatore dei sistemi **aggiornati dall'ultimo tick**, in totale e fra i P1-P2, ad esempio "68/389 aggiornati dall'ultimo tick · P1-P2: 11/22". La colonna "Aggiornato" resta in giorni.
- "Dati Spansh scaricati il…" diventa "Dati Spansh aggiornati il…": con la pubblicazione solo quando i dati cambiano, è l'ora dell'ultimo cambiamento.

### Roadmap

- Annotata fra le idee future la **Pattuglia** ("Da visitare"): i sistemi P1-P2 ancora fermi a prima del tick, da far visitare ai piloti per aggiornare Spansh.

### Test

- Nuovi test per il contatore e per il confronto dei dati. Passano 150 test dell'app e 12 degli script.

## [0.6.2] - 2026-10-04 — ACFS BGS Tool, nuovo pannello dei filtri

### Nome

- Il tool si chiama **ACFS BGS Tool** (titolo, intestazione, README).
- Il repo si chiama `ed-acfs/acfs-bgs-tool` (prima `acfs-bgs`) e il sito si sposta su **https://flottastellare.it/acfs-bgs-tool/**. Il vecchio indirizzo `/acfs-bgs/` smette di funzionare: GitHub non reindirizza i percorsi delle Pages.
- Progetto Angular e pacchetto npm `acfs-bgs-tool`; build in `dist/acfs-bgs-tool/`. I file esportati si chiamano `acfs-bgs-tool-AAAA-MM-GG`.

### Interfaccia

- Ricerca e filtri in un **unico pannello**, su due righe ordinate: distanza e righe per pagina sopra, filtri sotto. Su schermi stretti i gruppi vanno a capo interi.
- I filtri sono **pulsanti a segmenti** uniti ("Tutti | Nessuno | ACFS") invece di pillole separate, con un'etichetta "Mostra" per Guerre/Elezioni e Da aggiornare; i campi di testo sono alti 36 px invece di 56.
- Tooltip sui filtri, e stato premuto (`aria-pressed`) per i lettori di schermo.

## [0.6.1] - 2026-10-04 — Modifica delle assegnazioni e filtro architetti ACFS

### Interfaccia

- Accanto a un architetto già registrato (o a un sistema segnato "non è una colonia") c'è una matita ✎ che riapre il dialog per **modificare l'assegnazione**. Il dialog si apre con i valori attuali e il titolo "Modifica assegnazione"; l'invio aggiunge una riga al registro, che vale come ultima.
- Nuovo filtro rapido **"ACFS"** nella sezione Architetto: solo i sistemi il cui architetto risulta membro ACFS. L'appartenenza è della persona: conta la sua registrazione più recente con un'appartenenza indicata, in qualunque sistema. Non serve un elenco separato dei membri: lo dice il registro.

### Test

- Nuovi test per l'elenco degli architetti ACFS e per il dialog in modifica. Passano 146 test dell'app e 7 degli script.

## [0.6.0] - 2026-10-04 — Pubblicazione su GitHub Pages

Fase 6 di [ROADMAP.md](ROADMAP.md). Il tool va online su **https://flottastellare.it/acfs-bgs/** e si aggiorna da solo.

### Pubblicazione

- Nuovo workflow `.github/workflows/pages.yml`, al posto di quello ereditato dai Canonn (`main.yml`): installa, esegue i test, scarica i dati da Spansh, fa il build per `/acfs-bgs/` e pubblica su GitHub Pages.
- Parte a ogni push su `main`, **ogni ora** (al minuto 17, senza test) e a mano dalla scheda Actions. Ogni ora perché Spansh si riempie mano a mano che i giocatori passano nei sistemi dopo il tick.
- Nuovo comando `npm run build:pages`. Il progetto Angular si chiama `acfs-bgs` e il build finisce in `dist/acfs-bgs/`.

### Interfaccia

- Sotto il titolo, quando sono stati scaricati i dati da Spansh e quando c'è stato l'ultimo tick, in UTC.
- Una modifica al registro o alla Watchlist compare entro 15 minuti (prima la pagina teneva i fogli in memoria per 2 ore).

### Dati

- `scripts/fetch-bgs.mjs` salva anche l'ora dell'ultimo tick (`tick_at`) letta dall'EDCD Tick Detector. Se il servizio non risponde il valore resta vuoto e lo scaricamento prosegue.

### Registro

- Inseriti nel registro i 6 sistemi che il registro Canonn assegna a Flotta Stellare (Lagoon Sector YZ-Y c6, Col 285 Sector ZV-M d7-91, Lyncis Sector CL-Y d68, Lyncis Sector NY-R b4-2, Col 285 Sector MY-Q c5-21, HIP 1773), con architetti membri ACFS.
- Inseriti anche i 3 sistemi che il registro Canonn assegna a Canonn (Lagoon Sector AQ-X b1-2, YU-X b1-4, ZU-X b1-9), con fazione preferita Canonn: nel nostro tool sono "non intervenire", come i nostri 6 lo sono nel loro. Registrati con Flotta Stellare anche HIP 30129 e Col 285 Sector MY-Q c5-22, che controlliamo e dove il registro Canonn indica solo l'architetto.
- Lyncis Sector CL-Y d68, perso contro Canonn alle elezioni del 4 ottobre 2026, è in Watchlist in prima posizione: resta P1 finché non torniamo primi.

### Test

- Nuovi test per la lettura del tick. Passano 142 test dell'app e 7 degli script.

## [0.5.0] - 2026-10-04 — Registro architetti e Watchlist ACFS

Fase 5 di [ROADMAP.md](ROADMAP.md). Il tool legge e scrive il registro dello squadrone invece di non averne nessuno.

### Registro

- Collegati il Google Form "ACFS Architect Registry" e il suo foglio di risposte, pubblicato come TSV. Il dialog "Assegna" invia le risposte al Form; la colonna Architetto e la Fazione preferita le leggono dal foglio.
- Risposte di appartenenza ACFS ("The Architect is an ACFS Member", "Not an ACFS Member"…), mostrate in italiano nel dialog ("L'architetto è un membro ACFS", "Non è un membro ACFS", "Nessuno: il sistema non è una colonia", "Non so").
- Flotta Stellare è l'opzione elencata di Fazione preferita; ogni altra fazione passa dall'opzione "Altro" del Form.
- Una fazione preferita registrata vale più di quella ricavata dalle stazioni: un sistema registrato con un'altra fazione diventa "non intervenire" (⛔).

### Watchlist

- Collegata la scheda `Watchlist` dello stesso foglio (`System`, `Faction`, `Position`, `Details`). Per ora è vuota.

### Verifica

- Prova reale: una risposta inviata con gli stessi campi dell'app compare nel foglio pubblicato in circa 15 secondi e viene letta correttamente. La riga di prova ("PROVA - cancellare questa riga") va cancellata dal foglio.
- Nel codice non restano riferimenti ai Canonn, a parte i crediti e l'intermediario del typeahead.
- Passano 142 test dell'app e 5 degli script.

## [0.4.0] - 2026-10-04 — Priorità a fazione singola

Fase 4 di [ROADMAP.md](ROADMAP.md). La colonna Priorità ora lavora per Flotta Stellare: al 4 ottobre 2026 ci sono 17 sistemi in P1, 5 in P2, 16 in P3, 23 in P4 e 328 in P5.

### Priorità

- Logica a una sola fazione: tolti i trigger a coppia Canonn/CDSR (`canonn-cdsr-close`, "Canonn vs Canonn") e il calcolo del margine contro "l'altra nostra fazione".
- **Sistemi non registrati**: sono tutti "nostri" (in scope), quindi oltre alla difesa compare anche "Da conquistare" dove siamo dietro chi controlla. La scelta è configurabile con `unregisteredScope` in `config.json`: `"assumed"` ripristina la politica Canonn (solo difesa finché il sistema non viene registrato). Decisa su una simulazione con i dati reali di tre politiche diverse.
- La regola "Ultima su 4 o più fazioni" (P1) vale nei sistemi "nostri", non solo in quelli con preferenza registrata.
- La regola "Nessun architetto assegnato" resta come nei Canonn: vale solo per i sistemi "assumed", quindi con la politica attuale non scatta.
- Livelli rinumerati sulla scala ACFS: la massima priorità è **P1** (nei Canonn era P0), la minima P5.
- Motivazioni della priorità in italiano ("Guerra in corso", "Da conquistare: 5,0 punti dietro chi controlla", ecc.).

### Dati e stati

- Guerre, elezioni, ritirate ed espansioni sono quelle di Flotta Stellare; il tooltip nomina prima noi e poi l'avversario ("Election: Flotta Stellare vs Canonn").
- Tolte le icone "Canonn vs Canonn" e `public/assets/canonn.svg`. Le icone di guerra ed elezioni hanno un nome accessibile.
- Fazione preferita ricavata: Flotta Stellare nei sistemi dove controlla almeno una stazione (289 su 389), mostrata in grigio.
- Dialog "Assegna": per un membro dello squadrone la fazione preferita di default è Flotta Stellare, se presente nel sistema.

### Situazione al 4 ottobre 2026

- Due elezioni contro Canonn: Lyncis Sector CL-Y d68 (controllato da noi) e Lyncis Sector NY-R b4-2 (controllato da Canonn), entrambi 50-50. Sono due dei sei sistemi che il registro Canonn assegna a Flotta Stellare.

### Test

- `priority.spec.ts` riscritto per una sola fazione; i test della politica Canonn passano `"assumed"` esplicito. Nuovi test per la politica dello squadrone. `station-preference.spec.ts` al posto di `canonn-asset-preference.spec.ts`. Passano 142 test dell'app e 5 degli script.

## [0.3.0] - 2026-10-04 — Identità ACFS, italiano, colonne ACFS e Margine

Fase 3 di [ROADMAP.md](ROADMAP.md). È la prima versione che si presenta come tool ACFS e mostra l'influenza di Flotta Stellare.

### Identità

- Logo 2025 "Vanguards" di Alto Comando Flotta Stellare (`ed-acfs.github.io/extras/ACFS_Logo_2025_Vanguards/`, ridotto a 301×340 px) nell'intestazione e nella schermata di caricamento, al posto dell'SVG animato Canonn. Durante il caricamento pulsa leggermente (non se il sistema chiede animazioni ridotte).
- Titolo "ACFS BGS", descrizione in italiano, `lang="it"`, favicon e icona Apple dello squadrone (dal set `icon-vanguards` del sito).

### Italiano

- Interfaccia in italiano: intestazioni, filtri rapidi, paginazione, tooltip, messaggi di errore, dialog "Assegna" e dialog informazioni sul sistema.
- Numeri in formato italiano tramite `LOCALE_ID` `it-IT` ("42,5%", "1.234").
- Età del dato: "oggi", "5g", "3s", "1a+". Il tooltip mostra data e ora dell'aggiornamento in UTC, cioè l'ora di gioco.

### Colonne

- **ACFS** al posto di CANO: influenza di Flotta Stellare.
- **Margine** al posto di CDSR: nei sistemi controllati, vantaggio sulla seconda fazione; altrove, distacco da chi controlla. Verde sopra la soglia di rischio, rosso sotto (5 punti, `conflictMarginPoints` in `config.json`), grigio per i distacchi. Il tooltip indica la fazione di confronto e la sua influenza. Al 4 ottobre 2026 l'unico sistema controllato sotto soglia è Lyncis Sector CL-Y d68, a 0,0 punti da Canonn.
- Nel grafico Fazioni la barra arancione è quella di Flotta Stellare.
- Il filtro rapido "Canonn" diventa **"Controllati"**: mostra solo i sistemi controllati da Flotta Stellare.

### Export

- JSON e CSV riportano `factionInfluence`, `marginPoints` e `marginVersus` al posto di `canonnInfluence` e `cdsrInfluence`.

### Correzioni

- I colori delle celle di influenza (e ora di margine) non comparivano mai: la regola generica sul colore delle celle li sovrascriveva. Il difetto era già nell'originale Canonn.

### Test

- Nuovo `src/core/margin.spec.ts` per il calcolo del margine. Passano 144 test dell'app e 5 degli script.

### Ancora in inglese

- Le motivazioni della priorità nel tooltip e le icone "Canonn vs Canonn": si rifanno nella fase 4.
- Le opzioni di appartenenza del dialog "Assegna": sono le risposte del Form Canonn e cambiano con il nostro Form, nella fase 5.

## [0.2.0] - 2026-10-04 — Modulo core e configurazione

Fase 2 di [ROADMAP.md](ROADMAP.md). Riorganizzazione interna: per chi usa il tool cambia solo il sistema di riferimento della distanza.

### Struttura

- Nuova cartella `src/core/`, senza Angular né API del browser, così la stessa logica potrà girare anche in Node per il report su Discord. Contiene i moduli che erano in `src/app/data/` (priorità, freschezza, registro architetti, Watchlist, export, distanza) e il nuovo `bgs.ts`, con i tipi dei dati, la conversione da record Spansh a riga della tabella e l'analisi di guerre, elezioni, ritirate ed espansioni.
- Il service (`CanonnBgsService`, ora `BgsService` in `app/bgs.service.ts`) si occupa solo di caricamento e cache: da circa 1.050 a circa 460 righe.
- Le parti legate al browser restano nell'app: lo scaricamento di JSON e CSV (`app/export-download.ts`) e il nome del comandante salvato nel browser (`app/your-name.ts`).
- Il logger non dipende più da Angular: lo attiva `main.ts` in modalità sviluppo.

### Configurazione

- Nuovo `src/core/config.json`, con i tipi in `config.ts`: squadrone, fazione, capitale, seconda fazione da confrontare (vuota), soglia del margine (5 punti), prefisso delle chiavi nel browser, indirizzi di dati, typeahead, Sheet e Form.
- `scripts/fetch-bgs.mjs` legge il nome della fazione dallo stesso file.
- Le chiavi salvate nel browser usano il prefisso `acfs-bgs:` invece di `canonn-bgs:`. Il nome del comandante salvato con la versione precedente va reinserito.
- Il sistema home usato per sopprimere l'avviso di ritirata è Wong Sher per Flotta Stellare, al posto di Varati e Canonnia.

### Interfaccia

- La distanza si misura di default da Wong Sher, anche nella tabella, e non più dal primo sistema caricato.
- I file esportati si chiamano `acfs-bgs-AAAA-MM-GG.json` e `.csv`.

### Test

- Nuovo `scripts/core-purity.test.mjs`: fallisce se in `src/core/` compaiono import di Angular o dell'app, DOM o `localStorage`.
- Passano 138 test dell'app e 5 degli script.
- Fine riga LF in tutti i sorgenti, compreso `priority.ts` che era l'unico in CRLF.
- Nuovo workflow `.github/workflows/ci.yml`: script, test e build a ogni pull request e a ogni push su `main`. Non pubblica nulla.

## [0.1.0] - 2026-10-04 — Dati Flotta Stellare da Spansh

Prima versione di ACFS BGS, derivata da [canonn-colony-operations](https://github.com/canonn-science/canonn-colony-operations), commit `551a119`. Corrisponde alla fase 1 di [ROADMAP.md](ROADMAP.md): l'app mostra i sistemi di Flotta Stellare invece di quelli dei Canonn. Interfaccia, colonne e calcolo della priorità sono ancora quelli dei Canonn: si adattano nelle fasi 2–4.

### Dati

- Nuovo script `scripts/fetch-bgs.mjs` (`npm run fetch-data`). Scarica da Spansh tutti i sistemi in cui Flotta Stellare è presente e li salva in `public/data/bgs.json`, un file che non viene versionato. Il procedimento è quello della Cloud Function `canonnbgs` dei Canonn: salva la ricerca, la richiama a pagine da 500, poi toglie corpi celesti, ricette e dettagli delle stazioni. Al 4 ottobre 2026 i sistemi sono 389, di cui 249 controllati, e lo scaricamento dura circa 3 secondi.
- `npm start` e `npm run build` scaricano i dati solo se il file manca (`--if-missing`), così Spansh non viene interrogato a ogni avvio.
- L'app legge il file statico con una sola richiesta, al posto del token e delle pagine della Cloud Function Canonn.

### Separazione dai Canonn

- Scollegati il registro architetti e la Watchlist dei Canonn: i loro Google Sheet non vengono più letti.
- Il dialog "Assign" non invia più nulla al Google Form dei Canonn. Finché non c'è il Form ACFS (fase 5), l'invio viene rifiutato con un errore.
- La distanza si misura di default da Wong Sher, non più da Varati.
- Rimosso `public/CNAME` con il dominio `bgs.canonn.tech`.

### Progetto

- `README.md` riscritto per ACFS. Aggiunti `ROADMAP.md`, con piano e decisioni, e questo changelog.
- Nuova nota di copyright ACFS in `LICENSE`, che conserva quella originale del Canonn Research Group.
- `package.json`: nome `acfs-bgs`, versione 0.1.0.
- `src/app/build-info.ts` non è più versionato. Viene generato prima di start, build e test.
- Disattivato il workflow di deploy su GitHub Pages ereditato dai Canonn: falliva a ogni push su `main` perché Pages non è attivo. Torna con la fase 6.

### Test

- Nuovi test per lo script dei dati (`npm run test:scripts`, con `node --test`).
- Riscritti i test del service per il file statico. In tutto passano 138 test dell'app e 4 dello script.

### Ancora da fare

- Le colonne CANO e CDSR sono vuote e la priorità è P4 ovunque, perché il codice cerca ancora l'influenza di "Canonn". La sistemazione è prevista nelle fasi 3 e 4.
- La ricerca per distanza usa ancora l'intermediario pubblico dei Canonn per i nomi dei sistemi.
