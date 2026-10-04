# Changelog

Tutte le modifiche rilevanti di questo progetto sono documentate in questo file.

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
