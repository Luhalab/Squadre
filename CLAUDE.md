# CLAUDE.md

Istruzioni per Claude (e per chi sviluppa) su questo repository.

## Panoramica

**Squadre** è una PWA personale in italiano che mostra classifica, partite, risultati e live di Inter, Palermo, Italia e Winterthur. È pubblicata su **Vercel**: file statici alla radice + funzioni serverless Node.js in `api/`. Non ci sono `package.json`, dipendenze, build o test automatici.

## File

- `index.html`: tutta l'app (CSS e JS inline). Contiene anche `DEMO`, dati dimostrativi usati al primo avvio o se l'API fallisce senza cache.
- `api/data.js`: endpoint `GET /api/data`, cuore del progetto. Aggrega le fonti e calcola il TTL della cache.
- `api/test.js` + `test.html`: strumenti di diagnostica in sola lettura per ispezionare le fonti dal telefono.
- `sw.js`: service worker, cache `squadre-vN` (stale-while-revalidate per le pagine, `/api/` mai in cache).
- `manifest.json`, `icon-*.png`: PWA.

## Fonti dati (in `api/data.js`)

1. **ESPN** (`site.api.espn.com`, senza chiave): fonte principale. Competizioni in `LG` (`A` Serie A, `B` Serie B, `N` Nations League, `C` Champions, `S` Super League, `W` Challenge League), titoli in `TIT`.
2. **TheSportsDB** (chiavi gratuite `3` / `123`): riserva per le squadre con `tt: true` (oggi solo il Winterthur). `lookuptable` con la chiave gratuita dà solo 5 righe: se possibile la classifica si ricalcola dai risultati (`fromResults`).
3. **Teletext SRF** (`api.teletext.ch/channels/SRF1/pages/203|204`): serve solo a completare una classifica parziale, e solo se le righe in comune coincidono. Pagine da 40 colonne in base64, set nazionale tedesco (`TTCH`), nomi abbreviati mappati in `TTN`.

Le richieste di riserva partono **in parallelo** a ESPN, non dopo: non serializzarle.

## Convenzioni

- **Lingua**: interfaccia, commenti e messaggi di commit in **italiano**. I nomi delle squadre/nazioni si traducono tramite la mappa `IT` / `nm()` in `data.js`.
- **Stile del codice**: JavaScript compatto e senza dipendenze, nomi brevi (`D`, `sel`, `cmp`, `$`, `nm`, `get`…). Mantieni questo stile, non introdurre framework, bundler o librerie.
- **Squadre**: definite in `TEAMS` (`id`, `name`, regex `re` per riconoscerle nei dati, `tt` per le fonti di riserva). Per aggiungerne una servono anche: colori `.tm-<id>` in `index.html` (`--c1`, `--ink`, `--band`, `--tc`), alias in `TQ` se serve TheSportsDB, voce in `DEMO`, eventualmente la competizione in `LG`/`TIT`.
- **Esiti**: `V` / `N` / `P` (vittoria, pareggio, sconfitta).
- **Cache**: il TTL (`s-maxage`) si calcola dal calendario: 60 s durante o a ridosso di una partita, 300 s nelle 3 ore dopo, fino a 6 h altrimenti. Una risposta senza dati restituisce `502` con `no-store`. Non rendere la cache più aggressiva: le fonti sono non ufficiali.
- **Fetch**: usa sempre `get()` (timeout 8 s, user-agent `UA`). Ogni fonte deve poter fallire senza bloccare le altre (`Promise.allSettled`, errori raccolti in `errors`).
- **Service worker**: se cambi la strategia di cache o i file precaricati, incrementa `C` (`squadre-v2` → `v3`).
- **Client**: al caricamento mostra subito `localStorage['sq-data']`, poi `load()`. Ricarica ogni 60 s solo se c'è una partita live, e al ritorno in primo piano dopo più di 60 s.

## Sviluppo e verifica

- Locale: `vercel dev` (pagina + funzioni su `http://localhost:3000`).
- Controllo rapido della sintassi: `node --check api/data.js api/test.js`.
- Verifica dei dati: `/api/data` (JSON, campi `teams`, `tables`, `errors`, `via`, `dbg`), `/test.html` o `/api/test?...`.
- Nessuna suite di test: verifica le modifiche all'interfaccia aprendo la pagina (anche a larghezza smartphone, max 560px) in tema chiaro e scuro.
