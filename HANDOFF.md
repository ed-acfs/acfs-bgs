# Handoff: tool BGS per lo squadrone

Documento di passaggio da una sessione di analisi in chat. Riassume cosa è stato letto, cosa è stato deciso e cosa resta aperto. I punti marcati **DA VERIFICARE** non sono stati provati.

## Obiettivo

Creare un tool BGS (background simulation di Elite Dangerous) per il mio squadrone, partendo da `canonn-science/canonn-colony-operations` (licenza MIT). Deve girare in modo autonomo e, in un secondo momento, avere un'integrazione Discord.

I dati dello squadrone (nome esatto della fazione in gioco, sistema home, numero di sistemi) sono già noti a Claude Code da sessioni precedenti: usali, e se mancano chiedili prima di procedere.

## Stato attuale (4 ottobre 2026)

- Repo: https://github.com/ed-acfs/acfs-bgs (organization `ed-acfs`, **privato**)
- Copia locale: `C:\Users\ccast\Progetti\acfs-bgs` (Windows, PowerShell)
- Remote `origin`: `https://github.com/ed-acfs/acfs-bgs.git` (HTTPS con Git Credential Manager; su questo PC non c'è una chiave SSH registrata su GitHub)
- Remote `upstream`: `https://github.com/canonn-science/canonn-colony-operations.git`
- Il codice è ancora quello upstream, non modificato
- **Non ancora fatto o non confermato**: verifica del push, `npm ci`, test, build, rimozione di `public/CNAME`, disattivazione del workflow di deploy

## Progetto di partenza

- Repo: https://github.com/canonn-science/canonn-colony-operations
- Commit analizzato: `551a119` (branch `main`, 18 commit)
- SPA Angular 22 standalone, zoneless, signals, `OnPush`; Angular Material, FontAwesome, SCSS
- TypeScript 6, Vitest con jsdom, Node 22
- Nessun backend proprio: build statico in `dist/canonn-bgs/browser/`, deploy su GitHub Pages (`.github/workflows/main.yml`), dominio in `public/CNAME` (`bgs.canonn.tech`)
- Il README upstream non documenta priorità, watchlist, export e assegnazione architetto

### Sorgenti dati (tutte chiamate dal browser)

| Sorgente | Uso | Note |
|---|---|---|
| Cloud Function `https://us-central1-canonn-api-236217.cloudfunctions.net/query/canonnbgs` | Sistemi, fazioni, stati, stazioni | Prima chiamata restituisce un token, poi `/{token}/{page}`. Dimensione pagina dedotta dalla pagina 0. **Restituisce solo sistemi Canonn** |
| `…/query/typeahead?q=` | Nome sistema e coordinate | Per l'ordinamento per distanza |
| Google Sheet pubblicato (TSV) | Architect Registry | Fallback su `…/canonnbgs/architects/{page}`, cache `localStorage` 2 ore legata a `BUILD_ID` |
| Stesso Sheet, altro tab | Priority Watchlist | Nessun fallback |
| Google Form (POST `no-cors`) | Assegnazione architetto | Risposta non leggibile, nessun retry |

### Mappa del codice

| File | Righe | Contenuto |
|---|---|---|
| `src/app/canonn-bgs.service.ts` | 1.109 | Fetch con timeout e retry, cache, `toRow()` (record API → `BgsRow`), `summarizeFactionState()` per guerra, elezione, ritirata, espansione |
| `src/app/bgs-table/bgs-table.component.ts` | 998 | Unica vista: modalità `paged` / `distance` / `column`, filtri rapidi, paginazione client-side |
| `src/app/data/priority.ts` | 462 | Scope gate (`in-scope`, `assumed`, `out-of-scope`, `no-preference`) e trigger con punteggio. Tier: P0 ≥ 85, P1 ≥ 65, P2 ≥ 40, P3 ≥ 20, altrimenti P4 |
| `src/app/data/freshness.ts` | 131 | Età del dato da `updated_at` (formato non ISO, vedi `parseUpdatedAt`) |
| `src/app/data/export.ts` | 157 | Export CSV e JSON |
| `src/app/data/architect-registry.ts`, `architect-form.ts`, `priority-watchlist.ts` | — | Specifici della colonizzazione Canonn |
| `src/app/data/home-systems.ts`, `distance.ts`, `your-name.ts` | — | Utility |

La logica in `data/` è fatta di funzioni pure ed è ben coperta dai test (`priority.spec.ts`: 753 righe). Service e componente tabella sono monolitici.

### Elementi cablati su Canonn

- Nomi fazione `Canonn` e `Canonn Deep Space Research` (`CANONN_FACTION`, `CDSR_FACTION`, `CANONN_FACTION_NAMES`)
- Sistemi home `Varati` e `Canonnia` (`home-systems.ts`); `DEFAULT_SEARCH_SYSTEM = 'Varati'`
- Regola "stazione con `canonn` nel nome" (`isCanonnAsset`, `derivePreferredFaction`)
- URL degli Sheet e ID dei campi del Google Form
- Logica a due fazioni proprie (trigger `canonn-cdsr-close`, `isCanonnOnlyPair`)
- `public/CNAME`, logo, chiavi `localStorage` con prefisso `canonn-bgs:`

### Dettagli tecnici da sapere

- `src/app/data/priority.ts` ha fine riga CRLF, gli altri file LF: normalizzare prima di modificarlo
- `priority.ts` importa `BgsRow` e le costanti fazione da `canonn-bgs.service.ts`: per riusarlo fuori da Angular vanno spostati in un modulo senza dipendenze dal framework
- `src/app/build-info.ts` è generato da `scripts/generate-build-info.js` (prestart/prebuild)

## Decisioni prese

1. **Repo indipendente `ed-acfs/acfs-bgs`, non fork GitHub.** Upstream resta come remote `upstream` per recuperare eventuali fix. Il file `LICENSE` MIT con la nota di copyright originale va mantenuto.
2. **Struttura a tre parti**: `core/` (TypeScript puro: tipi, priorità, freshness, stati), `web/` (SPA), `bot/` (Discord). Sito e bot devono calcolare le stesse priorità dallo stesso codice.
3. **Discord in ordine di costo**: prima webhook schedulato (report dopo il tick), poi eventuale bot con slash command (discord.js). Discord Activity (SPA in iframe) scartata per ora.

## Questioni aperte

1. **Fonte dati (bloccante).** Candidati, tutti **DA VERIFICARE**:
   - Spansh: ricerca sistemi per fazione presente. I commenti nel codice upstream indicano Spansh come origine dei dati Canonn. Da controllare: endpoint, CORS dal browser, limiti d'uso
   - EDDN con listener e DB propri: richiede un servizio sempre acceso
   - Elite BGS / Inara: da controllare stato del servizio e copertura BGS
   - Se la fonte non è chiamabile dal browser: job schedulato che scarica i dati e pubblica un JSON statico
2. **Colonizzazione.** Lo squadrone ha colonie? Se no, togliere Architect Registry, Google Form e watchlist e semplificare `resolveScope()`. Se sì, servono uno Sheet e un Form propri.
3. **Una fazione o più.** Con una sola fazione propria i trigger a coppia vanno rimossi.
4. **Hosting.** Con repo privato e organization su piano Free, GitHub Pages non è disponibile (**DA VERIFICARE** il piano di `ed-acfs`). Alternative: rendere pubblico il repo, oppure ospitare il build statico altrove. Su Pages senza dominio personalizzato il build richiede `--base-href /acfs-bgs/`.
5. **Hosting dell'eventuale bot Discord.**
6. Le 2 issue aperte upstream non sono state lette.

## Primi passi

```powershell
cd C:\Users\ccast\Progetti\acfs-bgs

# 1. verificare remote e allineamento con origin
git remote -v
git status -sb                      # atteso: ## main...origin/main
git ls-remote --heads origin        # atteso: refs/heads/main

# 2. fermare il deploy automatico finché l'hosting non è deciso
#    (il workflow gira a ogni push su main e fallisce al deploy;
#     sui repo privati i minuti Actions sono a consumo)
gh workflow disable "Deploy static content to Pages" --repo ed-acfs/acfs-bgs

# 3. togliere il dominio di Canonn
git rm public/CNAME
git commit -m "Remove upstream CNAME"
git push

# 4. verificare lo stato di partenza (Node 22)
node --version
npm ci
npm test -- --watch=false
npm start                           # http://localhost:4200
```

Ordine di lavoro proposto:

1. Verificare build e test sul codice non modificato
2. Risolvere la questione 1 con una chiamata di prova alla fonte scelta per la fazione dello squadrone
3. Estrarre gli elementi cablati in un unico file di configurazione
4. Spostare tipi e logica pura in `core/`
5. Sostituire il data layer in `canonn-bgs.service.ts`
6. Webhook Discord
