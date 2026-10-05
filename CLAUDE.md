# Istruzioni per Claude Code

Lavoro su questo progetto da due PC diversi (lavoro e casa): questo file è l'unico posto condiviso in modo uniforme fra i due, perché viaggia col repo. Le note di sessione (memoria locale di Claude) restano su una sola macchina e non vanno usate come fonte per decisioni di progetto: quelle stanno in `ROADMAP.md` (fasi, decisioni con data) e `CHANGELOG.md` (storico). All'inizio di una sessione, leggi quei due file per lo stato attuale invece di fidarti di un riassunto precedente.

## Lingua

Rispondi in italiano su questo progetto.

## Prima di dire "fatto"

Per una modifica a logica o interfaccia, avvia il server (`npm start`) e mostra cosa controllare su `localhost:4200`, non solo i test verdi — l'utente vuole vederlo girare in locale prima di accettarlo.

## Prima del push

Il repo è pubblico e un push su `main` pubblica sul sito reale entro circa 30 minuti (workflow automatico). Committa pure senza chiedere, ma chiedi sempre conferma esplicita prima di `git push`.

## Memoria locale dell'altro PC

Questo file esiste dal 5 ottobre 2026: la memoria locale di Claude accumulata prima di allora (sull'altro PC, o su questo in sessioni precedenti) può contenere decisioni o informazioni di progetto non ancora riportate qui, in `ROADMAP.md` o in `CHANGELOG.md`. Se nel corso di una sessione risulta visibile memoria locale con contenuto rilevante per il progetto non già coperto da questi file, analizzala e uniscila qui o nella roadmap (secondo il tipo di informazione), poi segnala all'utente cosa hai unito. Non limitarti a citarla: il contenuto deve finire nel repo per restare uniforme fra i due PC.
