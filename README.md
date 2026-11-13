# Squadre

Web app personale (PWA) che mostra in un colpo d'occhio **classifica, ultime partite, prossimi impegni e risultati in diretta** di quattro squadre:

| Squadra    | Competizioni seguite                      |
|------------|-------------------------------------------|
| Inter      | Serie A, Champions League                 |
| Palermo    | Serie B                                   |
| Italia     | Nations League                            |
| Winterthur | Super League / Challenge League (Svizzera) |

L'interfaccia è in italiano, si installa sul telefono come app e funziona anche con dati salvati quando la rete è lenta.

## Funzionalità

- **Card per squadra**: posizione, punti, partita in corso (punteggio e minuto), prossima partita e ultimo risultato.
- **Classifica** della competizione selezionata, con la squadra evidenziata, le zone colorate (Champions, promozione, retrocessione…) e un menu per cambiare competizione quando la squadra ne gioca più di una.
- **Dettaglio squadra**: forma recente (V/N/P), prossime partite, link alla diretta.
- **Aggiornamento automatico** ogni minuto mentre c'è una partita in corso e quando si torna sull'app dopo più di un minuto.
- **Apertura istantanea**: la pagina viene servita dalla cache del service worker e mostra subito gli ultimi dati salvati (`localStorage`), poi si aggiorna dalla rete.
- **Ripiego su Google** se per una squadra non arriva nessun dato.

## Fonti dei dati

| Fonte | Uso |
|-------|-----|
| [ESPN](https://site.api.espn.com/apis/) (JSON non ufficiale, senza chiave) | Fonte principale: classifiche e calendario/risultati di tutte le competizioni. |
| [TheSportsDB](https://www.thesportsdb.com/) (chiave gratuita) | Riserva per il Winterthur quando ESPN non copre il campionato: classifica (solo prime 5 con la chiave gratuita, altrimenti ricalcolata dai risultati della stagione) e prossime partite. |
| Teletext svizzero SRF (`api.teletext.ch`, pagine 203/204) | Completa la classifica parziale di TheSportsDB per Super League / Challenge League, solo se le righe in comune coincidono. |

## Struttura del progetto

```
index.html      App completa (HTML + CSS + JS inline, nessun framework né build)
sw.js           Service worker: cache della pagina, /api/ escluso dalla cache
manifest.json   Manifest PWA (nome, icone, colori)
icon-192.png    Icone dell'app
icon-512.png
api/data.js     Funzione serverless Vercel: raccoglie i dati e li restituisce in JSON
api/test.js     Funzione di prova (sola lettura) per ispezionare le fonti
test.html       Pagina di diagnostica che interroga /api/test e permette di copiare il risultato
```

## Come funziona

1. Il browser carica `index.html` e chiama `GET /api/data`.
2. `api/data.js` interroga ESPN in parallelo per ogni competizione (classifica + partite) e, sempre in parallelo, le fonti di riserva per il Winterthur.
3. La risposta è un JSON con `teams` (dati per squadra), `tables` (classifiche), `errors` e alcune info di debug.
4. **Cache guidata dal calendario**: l'header `s-maxage` della CDN di Vercel va da 6 ore (nessuna partita vicina) fino a 60 secondi (partita in corso o imminente), così le fonti esterne vengono chiamate poco fuori dalle partite e spesso durante.
5. Se nessuna squadra ha dati, l'API risponde `502` senza cache e l'app mostra gli ultimi dati salvati (o i dati dimostrativi al primo avvio).

## Pubblicazione

Il progetto è pensato per **Vercel**: i file statici vengono serviti dalla radice e ogni file in `api/` diventa una funzione serverless Node.js. Non servono dipendenze, build né variabili d'ambiente.

```bash
# con la CLI di Vercel
vercel          # anteprima
vercel --prod   # produzione
```

Oppure si collega il repository GitHub a un progetto Vercel: ogni push viene pubblicato automaticamente.

## Sviluppo locale

```bash
vercel dev      # serve la pagina e le funzioni in /api su http://localhost:3000
```

Per verificare le fonti: aprire `/test.html`, oppure chiamare direttamente

- `/api/test?p=203` (pagina Televideo)
- `/api/test?e=a&k=standings` (ESPN: `e` = `a` | `b` | `n`, `k` = `standings` | `scoreboard`)
- `/api/test?t=<url teletext.ch>` (testo grezzo del Teletext svizzero)
