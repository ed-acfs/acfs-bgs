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

## Commit, branch e pubblicazione

- **Niente riga `Co-Authored-By: Claude …` nei commit**, anche se il template di sistema la chiede: è una preferenza dell'utente in tutti i suoi repo. (Alcuni commit della 0.8.0 la contengono: non riscrivere la storia già pubblicata, basta non aggiungerla più.)
- Un branch per ogni modifica, poi merge su `main` (PR con CI `ci.yml` verde quando passa da GitHub). Quando l'utente approva il push di una modifica, sono inclusi merge e verifica che il sito pubblicato mostri la modifica: parole sue, "ovviamente fai anche merge, pubblicazione eccetera".
- `gh` tende a scegliere come repo predefinito quello dei Canonn (remote `upstream`): una PR aperta lì per sbaglio sarebbe pubblica. Su ogni PC eseguire una volta `gh repo set-default ed-acfs/acfs-bgs-tool` e passare comunque `--repo ed-acfs/acfs-bgs-tool` a `gh pr create`.
- Dopo il merge (e dopo il controllo qui sotto) cancellare il branch, su GitHub e in locale: l'utente l'ha autorizzato il 5 ottobre 2026.
- Dopo un merge controllare `git log main..origin/<branch>`: una volta un commit è rimasto fuori perché la PR era stata unita prima dell'ultimo push.
- **CHANGELOG (in italiano) e README si aggiornano a ogni modifica rilevante**, nello stesso commit, senza aspettare la richiesta. Formato: `## [x.y.z] - AAAA-MM-GG — titolo` con sottosezioni tematiche. A ogni nuova versione allineare `package.json` e `package-lock.json`.

## Convenzioni da rispettare

- **Scala di priorità: P1 è la massima, P5 la minima** (nei Canonn era P0). Vale per tool, Ordini, report Discord e documentazione: non scrivere P0 nei materiali nuovi.
- Interfaccia in italiano; i nomi degli stati BGS restano in inglese, come in gioco.
- Logo: quello 2025 "Vanguards" (`ed-acfs.github.io/extras/ACFS_Logo_2025_Vanguards/`). I file `ed-acfs.github.io/images/logo_*.png` sono il logo vecchio: non usarli.
- Il prefisso `acfs-bgs:` delle chiavi `localStorage` è rimasto invariato apposta dopo la rinomina in `acfs-bgs-tool`: cambiarlo farebbe perdere le impostazioni salvate.
- Niente dati strategici nel repo, che è pubblico: accordi con altre fazioni, fazioni preferite e motivazioni della Watchlist stanno solo nel foglio Google.
- Spansh è in ritardo rispetto al gioco: il tool deve mostrare la freschezza del dato, non presentarlo come autorevole.

## Come funziona il BGS (spiegato dall'utente)

- **Stati globali**: l'Expansion vale per la fazione intera e compare come stato in *tutti* i sistemi in cui la PMF è presente (Spansh la mostra infatti in pending in quasi tutti i nostri sistemi). Si espande da **un solo** sistema, deciso dal tick dopo 3 giorni di pending. Per questo il tool non ricava dai dati da dove parte un'Expansion: negli Ordini si scrive a mano.
- **Stati locali**: elezioni e guerre (e altri stati che il tool per ora non segue) valgono solo nel sistema in cui si attivano. Questi si possono ricavare dai dati sistema per sistema.
- **Punteggio di un conflitto**: si scrive sempre dal nostro punto di vista, i nostri giorni vinti per primi (es. "Close Defeat; 0-2"). Un conflitto in pending si annuncia in "Note & informazioni" con "(Draw; 0-0) 🆕".

## Note tecniche (da fare su ogni PC)

- `git config core.autocrlf input` in questo repo (sta in `.git/config`, quindi non viaggia col repo): senza, i file tornano in CRLF a ogni cambio di branch.
- Nei comandi Bash gli apostrofi italiani dentro `node -e '...'` o negli heredoc rompono le virgolette: per modifiche lunghe scrivere uno script `.cjs` nello scratchpad.
- Per verificare le modifiche visibili si possono fare screenshot con Edge headless; sotto circa 500 px di larghezza non scende, quindi per simulare un telefono usare almeno 520 px.
- GitHub sospende i workflow programmati dopo 60 giorni senza commit: se i dati del sito smettono di aggiornarsi, riattivare `pages.yml` dalla scheda Actions.
- I cron di GitHub partono in ritardo e spesso saltano: il 5 ottobre 2026, con il cron `17,47 * * * *`, ci sono state solo 3 esecuzioni `schedule` in tutta la giornata. Controllo: `gh run list --repo ed-acfs/acfs-bgs-tool --event schedule`.
