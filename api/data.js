// Dati reali via ESPN (JSON non ufficiale, senza chiave).
// La cache di Vercel segue il calendario: poche chiamate fuori dalle partite, una al minuto durante.
const B = 'https://site.api.espn.com/apis/';
const LG = { A: 'ita.1', B: 'ita.2', N: 'uefa.nations', C: 'uefa.champions', S: 'sui.1', W: 'sui.2' };
const TIT = { A: 'Serie A', B: 'Serie B', N: 'Nations League', C: 'Champions League', S: 'Super League', W: 'Challenge League' };
const TEAMS = [
  { id: 'inter', name: 'Inter', re: /^inter(?!\s*miami)|internazionale/i },
  { id: 'palermo', name: 'Palermo', re: /palermo/i },
  { id: 'italia', name: 'Italia', re: /^(italy|italia)$/i },
  { id: 'winterthur', name: 'Winterthur', re: /winterthur/i },
];
const IT = { 'FC Winterthur': 'Winterthur', 'Swiss Challenge League': 'Challenge League', 'Swiss Super League': 'Super League', 'Inter Milan': 'Inter', Internazionale: 'Inter', 'AS Roma': 'Roma', 'AC Milan': 'Milan', Italy: 'Italia', France: 'Francia', Germany: 'Germania', Spain: 'Spagna', Belgium: 'Belgio', Israel: 'Israele', Netherlands: 'Paesi Bassi', Portugal: 'Portogallo', Switzerland: 'Svizzera', England: 'Inghilterra', Croatia: 'Croazia', Denmark: 'Danimarca', Norway: 'Norvegia', Sweden: 'Svezia', Poland: 'Polonia', Turkey: 'Turchia', Greece: 'Grecia', Czechia: 'Rep. Ceca', 'Czech Republic': 'Rep. Ceca', Scotland: 'Scozia', Wales: 'Galles', Ireland: 'Irlanda', 'Republic of Ireland': 'Irlanda', Hungary: 'Ungheria', Ukraine: 'Ucraina', Slovakia: 'Slovacchia', 'Bosnia and Herzegovina': 'Bosnia', 'North Macedonia': 'Macedonia N.', Finland: 'Finlandia', Iceland: 'Islanda' };
const nm = n => IT[n] || n;
const UA = { 'user-agent': 'Mozilla/5.0 (Squadre app personale)' };
const ymd = d => d.toISOString().slice(0, 10).replace(/-/g, '');
const stat = (e, n) => { const s = (e.stats || []).find(x => x.name === n); return s ? Number(s.value) : null; };

async function get(url) {
  const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(8000) });
  if (!r.ok) { const b = await r.text().catch(() => ''); throw new Error('HTTP ' + r.status + ' ' + b.replace(/\s+/g, ' ').slice(0, 80)); }
  return r.json();
}
const TSDB = 'https://www.thesportsdb.com/api/v1/json/';
const TQ = { inter: ['Inter Milan', 'Inter', 'Internazionale'], palermo: ['Palermo'], italia: ['Italy'], winterthur: ['FC Winterthur', 'Winterthur'] };
async function tsdb(path) {
  let e;
  for (const k of ['3', '123']) { try { return await get(TSDB + k + '/' + path); } catch (x) { e = x; } }
  throw e;
}
const tsTeam = {};
function tsdbTeam(t) {
  return tsTeam[t.id] = tsTeam[t.id] || (async () => {
    for (const n of TQ[t.id]) {
      const q = await tsdb('searchteams.php?t=' + encodeURIComponent(n));
      const c = (q.teams || []).filter(x => x.strSport === 'Soccer' && TQ[t.id].includes(x.strTeam));
      if (c.length) return c[0];
    }
    throw new Error('squadra non trovata');
  })().catch(e => { delete tsTeam[t.id]; throw e; });
}
const tsSc = x => x == null || x === '' ? null : Number(x);
function tsEv(e) {
  const ts = e.strTimestamp ? String(e.strTimestamp).replace(' ', 'T') : e.dateEvent + 'T' + (e.strTime || '00:00:00');
  const h = tsSc(e.intHomeScore), a = tsSc(e.intAwayScore), done = h != null && a != null;
  return { t: ts + (/[zZ]$|[+-]\d\d:?\d\d$/.test(ts) ? '' : 'Z'), state: done ? 'post' : 'pre', clock: '', comp: nm(e.strLeague || ''),
    cs: [{ raw: e.strHomeTeam, home: true, sc: h }, { raw: e.strAwayTeam, home: false, sc: a }] };
}
// Classifica calcolata dai risultati della stagione (punti, differenza reti, gol fatti).
function fromResults(evs) {
  const T = {};
  const row = n => T[n] = T[n] || { raw: n, n: nm(n), pts: 0, pl: 0, w: 0, d: 0, l: 0, gf: 0, gd: 0, nc: null, nd: null };
  for (const e of evs) {
    const [h, a] = e.cs; row(h.raw); row(a.raw);
    if (e.state !== 'post') continue;
    for (const [x, y] of [[h, a], [a, h]]) {
      const r = T[x.raw]; r.pl++; r.gf += x.sc; r.gd += x.sc - y.sc;
      if (x.sc > y.sc) { r.w++; r.pts += 3; } else if (x.sc === y.sc) { r.d++; r.pts++; } else r.l++;
    }
  }
  return Object.values(T).sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || a.n.localeCompare(b.n)).map((r, i) => Object.assign(r, { rk: i + 1 }));
}
// Classifica di riserva quando ESPN non copre il campionato della squadra.
// Con la chiave gratuita lookuptable dà solo le prime 5: se i risultati coprono più squadre, uso quelli.
async function tsdbTable(t, now) {
  const tm = await tsdbTeam(t);
  const d = new Date(now), y = d.getUTCFullYear(), s = d.getUTCMonth() >= 6 ? y + '-' + (y + 1) : (y - 1) + '-' + y;
  const q = '?l=' + tm.idLeague + '&s=' + s;
  const [lt, se] = await Promise.allSettled([tsdb('lookuptable.php' + q), tsdb('eventsseason.php' + q)]);
  const arr = (r, k) => r.status === 'fulfilled' && Array.isArray(r.value[k]) ? r.value[k] : []; // la chiave gratuita può rispondere con un testo
  let ev = arr(se, 'events').map(tsEv), via = 'stagione';
  if (!ev.length) {
    // ripiego: una richiesta per giornata, fino a quella della prossima partita
    const nx = await tsdb('eventsnext.php?id=' + tm.idTeam).catch(() => ({}));
    const nr = Math.min(40, +((Array.isArray(nx.events) && nx.events.find(e => e.idLeague === tm.idLeague)) || {}).intRound || 0);
    const rr = await Promise.allSettled(Array.from({ length: nr }, (_, i) => tsdb('eventsround.php' + q.replace('&', '&r=' + (i + 1) + '&'))));
    ev = [].concat(...rr.map(r => arr(r, 'events'))).map(tsEv); via = 'giornate ' + nr;
  }
  let rows = arr(lt, 'table').map(r => ({ raw: r.strTeam, n: nm(r.strTeam), rk: +r.intRank, pts: +r.intPoints, pl: +r.intPlayed,
    w: +r.intWin, d: +r.intDraw, l: +r.intLoss, gd: +r.intGoalDifference, nc: null, nd: null })).sort((a, b) => a.rk - b.rk);
  const calc = fromResults(ev);
  // solo se i risultati sono completi: le squadre della tabella devono avere gli stessi punti
  const ok = rows.every(r => { const c = calc.find(c => c.raw === r.raw); return c && c.pts === r.pts && c.pl === r.pl; });
  if (calc.length > rows.length && calc.some(r => r.pl) && ok) rows = calc;
  if (!rows.length) throw new Error('classifica vuota' + (lt.status === 'rejected' ? ': ' + lt.reason.message : ''));
  return { title: nm(tm.strLeague), rows, ev, src: rows === calc ? 'risultati (' + via + ')' : 'tabella' };
}
async function tsdbNext(t) {
  const tm = await tsdbTeam(t);
  const [n, l] = await Promise.all([tsdb('eventsnext.php?id=' + tm.idTeam), tsdb('eventslast.php?id=' + tm.idTeam).catch(() => ({}))]);
  const A = x => Array.isArray(x) ? x : [];
  return A(n.events).concat(A(l.results)).map(tsEv);
}
// Programma di una squadra: giocate (schedule) + future (schedule?fixture=true, tutte le competizioni).
async function sched(lg, id) {
  const fut = (async () => {
    const urls = [`https://site.web.api.espn.com/apis/site/v2/sports/soccer/all/teams/${id}/schedule?fixture=true`,
      `${B}site/v2/sports/soccer/${lg}/teams/${id}/schedule?fixture=true`];
    for (const u of urls) { try { const e = events(await get(u)); if (e.length) return e; } catch (x) { /* provo la prossima */ } }
    throw new Error('nessuna partita futura');
  })();
  const [p, f] = await Promise.allSettled([get(`${B}site/v2/sports/soccer/${lg}/teams/${id}/schedule`).then(events), fut]);
  if (p.status === 'rejected' && f.status === 'rejected') throw p.reason;
  const pv = p.status === 'fulfilled' ? p.value : [], fv = f.status === 'fulfilled' ? f.value : [];
  return { ev: fv.concat(pv), nr: p.status === 'fulfilled' ? pv.length : 'err', nf: f.status === 'fulfilled' ? fv.length : 'err' };
}
async function board(lg, now) {
  const d = n => ymd(new Date(now + n * 864e5));
  const base = `${B}site/v2/sports/soccer/${lg}/scoreboard`;
  const tries = [''];
  const errs = [];
  for (let i = 0; i < tries.length; i++) {
    try { return { v: events(await get(base + tries[i])).map(e => Object.assign(e, { comp: TIT[Object.keys(LG).find(x => LG[x] === lg)] })), via: i + 1 }; }
    catch (e) { errs.push('#' + (i + 1) + ' ' + e.message); }
  }
  throw new Error(errs.join(' | '));
}
function groups(j) {
  const ch = j.children && j.children.length ? j.children : [j];
  return ch.map(c => ({
    name: c.name || '',
    rows: ((c.standings && c.standings.entries) || []).map((e, i) => {
      const raw = (e.team && (e.team.displayName || e.team.name)) || '?';
      const dr = stat(e, 'ties');
      return {
        raw, id: e.team && e.team.id, n: nm(raw), pts: stat(e, 'points'), pl: stat(e, 'gamesPlayed'), rk: stat(e, 'rank') || i + 1,
        w: stat(e, 'wins'), d: dr != null ? dr : stat(e, 'draws'), l: stat(e, 'losses'), gd: stat(e, 'pointDifferential'),
        nc: (e.note && e.note.color) || null, nd: (e.note && e.note.description) || null,
      };
    }).sort((a, b) => a.rk - b.rk),
  }));
}
function events(j) {
  return (j.events || []).map(e => {
    const c = (e.competitions && e.competitions[0]) || {};
    const so = e.status || c.status || {};
    const st = so.type || {};
    const sc = x => x == null ? null : Number(typeof x === 'object' ? (x.value != null ? x.value : x.displayValue) : x);
    return {
      t: e.date || c.date, state: st.state || (new Date(e.date || c.date) > Date.now() ? 'pre' : st.state), clock: so.displayClock || st.shortDetail || '',
      cs: (c.competitors || []).map(x => ({
        raw: (x.team && (x.team.displayName || x.team.name)) || '?',
        home: x.homeAway === 'home', sc: sc(x.score),
      })),
    };
  });
}
function forTeam(t, evs) {
  const seen = new Set();
  const mine = evs.filter(e => e.cs.some(c => t.re.test(c.raw))).filter(e => {
    const k = (e.t || '').slice(0, 10); if (seen.has(k)) return false; seen.add(k); return true;
  });
  const view = e => {
    const me = e.cs.find(c => t.re.test(c.raw));
    const op = e.cs.find(c => c !== me) || {};
    return { t: e.t, home: me.home, opp: nm(op.raw || '?'), sc: me.sc, osc: op.sc, clock: e.clock, comp: e.comp };
  };
  const by = s => mine.filter(e => e.state === s).sort((a, b) => new Date(a.t) - new Date(b.t)).map(view);
  const pre = by('pre').filter(x => new Date(x.t).getTime() > Date.now() - 3 * 3600e3), post = by('post'), inn = by('in');
  const out = {};
  if (pre[0]) out.next = { t: pre[0].t, home: pre[0].home, opp: pre[0].opp, comp: pre[0].comp };
  out.more = pre.slice(1, 4).map(x => ({ t: x.t, home: x.home, opp: x.opp, comp: x.comp }));
  if (post.length) {
    const l = post[post.length - 1];
    out.last = { t: l.t, home: l.home, opp: l.opp, score: l.sc + '-' + l.osc, res: l.sc > l.osc ? 'V' : l.sc < l.osc ? 'P' : 'N' };
  }
  if (inn[0]) out.live = { score: inn[0].sc + '-' + inn[0].osc, clock: inn[0].clock, opp: inn[0].opp };
  out.form = post.slice(-5).map(x => x.sc > x.osc ? 'V' : x.sc < x.osc ? 'P' : 'N');
  return out;
}

module.exports = async (req, res) => {
  const errors = [], now = Date.now();
  const keys = Object.keys(LG);
  const jobs = [];
  for (const k of keys) {
    jobs.push(get(`${B}v2/sports/soccer/${LG[k]}/standings`).then(j => ({ k, kind: 's', v: groups(j) })));
    jobs.push(board(LG[k], now).then(o => ({ k, kind: 'e', v: o.v, via: o.via })));
  }
  const rs = await Promise.allSettled(jobs);
  const S = {}, E = {}, via = {};
  rs.forEach((r, i) => {
    const k = keys[Math.floor(i / 2)], kind = i % 2 ? 'partite' : 'classifica';
    if (r.status === 'fulfilled') { const o = r.value; (o.kind === 's' ? S : E)[k] = o.v; if (o.via) via[k] = o.via; }
    else errors.push(`${TIT[k]} ${kind}: ${r.reason && r.reason.message}`);
  });

  const tables = {}, teams = [];
  for (const k of keys) {
    const gs = S[k]; if (!gs) continue;
    const mine = [];
    let pick = null;
    for (const t of TEAMS) {
      const g = gs.find(g => g.rows.some(r => t.re.test(r.raw)));
      if (g) { pick = pick || g; mine.push(g.rows.find(r => t.re.test(r.raw)).n); }
    }
    const g = pick || gs[0];
    tables[k] = { title: TIT[k], mine, rows: g.rows.map(r => [r.rk, r.n, r.pts, r.pl, r.w, r.d, r.l, r.gd, r.nc, r.nd]) };
  }
  let evs = [].concat(...Object.values(E));
  // Squadre senza classifica ESPN: provo TheSportsDB (es. Challenge League)
  const miss = TEAMS.filter(t => !keys.some(k => S[k] && S[k].some(g => g.rows.some(r => t.re.test(r.raw)))));
  const xsrc = {};
  const xt = await Promise.allSettled(miss.map(t => tsdbTable(t, now)));
  miss.forEach((t, i) => {
    if (xt[i].status === 'rejected') return errors.push(`Classifica ${t.name} (TheSportsDB): ${xt[i].reason && xt[i].reason.message}`);
    const k = 'X' + t.id, v = xt[i].value, me = v.rows.find(r => t.re.test(r.raw));
    if (!me) return errors.push(`Classifica ${t.name} (TheSportsDB): squadra assente in ${v.title}`);
    evs = evs.concat(v.ev); xsrc[t.id] = v.src + ' ' + v.rows.length + ' squadre';
    keys.push(k); TIT[k] = v.title; S[k] = [{ name: v.title, rows: v.rows }];
    tables[k] = { title: v.title, mine: [me.n], rows: v.rows.map(r => [r.rk, r.n, r.pts, r.pl, r.w, r.d, r.l, r.gd, r.nc, r.nd]) };
  });
  const tid = {};
  for (const t of TEAMS) for (const k of keys) {
    const g = S[k] && S[k].find(g => g.rows.some(r => t.re.test(r.raw)));
    const r = g && g.rows.find(r => t.re.test(r.raw));
    if (r && r.id) { tid[t.id] = { lg: LG[k], id: r.id }; break; }
  }
  const sj = await Promise.allSettled(TEAMS.filter(t => tid[t.id]).map(t => sched(tid[t.id].lg, tid[t.id].id)));
  TEAMS.filter(t => tid[t.id]).forEach((t, i) => {
    if (sj[i].status === 'fulfilled') evs = evs.concat(sj[i].value.ev);
    else errors.push(`Programma ${t.name}: ${sj[i].reason && sj[i].reason.message}`);
  });
  const tot = {}, tsn = {};
  TEAMS.filter(t => tid[t.id]).forEach((t, i) => { if (sj[i].status === 'fulfilled') tot[t.id] = sj[i].value.nr + ' giocate + ' + sj[i].value.nf + ' future'; });
  const nf = t => { const f = forTeam(t, evs); return f.next ? 1 + f.more.length : 0; };
  const need = TEAMS.filter(t => nf(t) < 2);
  const tj = await Promise.allSettled(need.map(tsdbNext));
  need.forEach((t, i) => {
    if (tj[i].status === 'fulfilled') { evs = evs.concat(tj[i].value); tsn[t.id] = tj[i].value.length; }
    else { tsn[t.id] = 'err'; errors.push(`Calendario ${t.name} (TheSportsDB): ${tj[i].reason && tj[i].reason.message}`); }
  });
  const dbg = TEAMS.map(t => `${t.name}: ESPN ${tot[t.id] == null ? '–' : tot[t.id]}${tsn[t.id] != null ? ', TSDB ' + tsn[t.id] : ''}${xsrc[t.id] ? ", classifica da " + xsrc[t.id] : ""} → ${nf(t)} future`);
  for (const t of TEAMS) {
    const o = { id: t.id, name: t.name, comps: keys.filter(k => tables[k] && tables[k].mine.includes(t.name)) };
    for (const k of keys) {
      const g = S[k] && S[k].find(g => g.rows.some(r => t.re.test(r.raw)));
      const r = g && g.rows.find(r => t.re.test(r.raw));
      if (r) { o.league = TIT[k]; o.pos = r.rk; o.pts = r.pts; o.played = r.pl; break; }
    }
    teams.push(Object.assign(o, forTeam(t, evs)));
  }

  if (!teams.some(t => t.pos || t.next || t.last || t.live)) {
    res.setHeader('cache-control', 'no-store');
    return res.status(502).json({ errors: errors.length ? errors : ['nessun dato per le squadre'] });
  }
  // TTL guidato dal calendario
  let ttl = 21600;
  for (const t of teams) {
    if (t.live) ttl = Math.min(ttl, 60);
    if (t.next) {
      const dt = new Date(t.next.t).getTime() - now;
      if (dt > -3 * 3600e3) ttl = Math.min(ttl, dt <= 600e3 ? 60 : Math.max(60, Math.floor((dt - 600e3) / 1000)));
    }
    if (t.last && now - new Date(t.last.t).getTime() < 3 * 3600e3) ttl = Math.min(ttl, 300);
  }
  res.setHeader('cache-control', `public, max-age=0, s-maxage=${ttl}, stale-while-revalidate=${Math.min(ttl, 300)}`);
  res.status(200).json({ src: 'ESPN', ts: new Date(now).toISOString(), ttl, via, dbg, teams, tables, errors });
};
