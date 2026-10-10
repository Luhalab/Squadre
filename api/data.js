// Dati reali via ESPN (JSON non ufficiale, senza chiave).
// La cache di Vercel segue il calendario: poche chiamate fuori dalle partite, una al minuto durante.
const B = 'https://site.api.espn.com/apis/';
const LG = { A: 'ita.1', B: 'ita.2', N: 'uefa.nations' };
const TIT = { A: 'Serie A', B: 'Serie B', N: 'Nations League' };
const TEAMS = [
  { id: 'inter', name: 'Inter', re: /^inter(?!\s*miami)|internazionale/i },
  { id: 'palermo', name: 'Palermo', re: /palermo/i },
  { id: 'italia', name: 'Italia', re: /^(italy|italia)$/i },
];
const IT = { 'Inter Milan': 'Inter', Italy: 'Italia', France: 'Francia', Germany: 'Germania', Spain: 'Spagna', Belgium: 'Belgio', Israel: 'Israele', Netherlands: 'Paesi Bassi', Portugal: 'Portogallo', Switzerland: 'Svizzera', England: 'Inghilterra', Croatia: 'Croazia', Denmark: 'Danimarca', Norway: 'Norvegia', Sweden: 'Svezia', Poland: 'Polonia', Turkey: 'Turchia', Greece: 'Grecia', Czechia: 'Rep. Ceca', 'Czech Republic': 'Rep. Ceca', Scotland: 'Scozia', Wales: 'Galles', Ireland: 'Irlanda', 'Republic of Ireland': 'Irlanda', Hungary: 'Ungheria', Ukraine: 'Ucraina', Slovakia: 'Slovacchia', 'Bosnia and Herzegovina': 'Bosnia', 'North Macedonia': 'Macedonia N.', Finland: 'Finlandia', Iceland: 'Islanda' };
const nm = n => IT[n] || n;
const UA = { 'user-agent': 'Mozilla/5.0 (Squadre app personale)' };
const ymd = d => d.toISOString().slice(0, 10).replace(/-/g, '');
const stat = (e, n) => { const s = (e.stats || []).find(x => x.name === n); return s ? Number(s.value) : null; };

async function get(url) {
  const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}
function groups(j) {
  const ch = j.children && j.children.length ? j.children : [j];
  return ch.map(c => ({
    name: c.name || '',
    rows: ((c.standings && c.standings.entries) || []).map((e, i) => {
      const raw = (e.team && (e.team.displayName || e.team.name)) || '?';
      return { raw, n: nm(raw), pts: stat(e, 'points'), pl: stat(e, 'gamesPlayed'), rk: stat(e, 'rank') || i + 1 };
    }).sort((a, b) => a.rk - b.rk),
  }));
}
function events(j) {
  return (j.events || []).map(e => {
    const c = (e.competitions && e.competitions[0]) || {};
    const st = (e.status && e.status.type) || {};
    return {
      t: e.date, state: st.state, clock: (e.status && e.status.displayClock) || st.shortDetail || '',
      cs: (c.competitors || []).map(x => ({
        raw: (x.team && (x.team.displayName || x.team.name)) || '?',
        home: x.homeAway === 'home', sc: x.score == null ? null : Number(x.score),
      })),
    };
  });
}
function forTeam(t, evs) {
  const mine = evs.filter(e => e.cs.some(c => t.re.test(c.raw)));
  const view = e => {
    const me = e.cs.find(c => t.re.test(c.raw));
    const op = e.cs.find(c => c !== me) || {};
    return { t: e.t, home: me.home, opp: nm(op.raw || '?'), sc: me.sc, osc: op.sc, clock: e.clock };
  };
  const by = s => mine.filter(e => e.state === s).sort((a, b) => new Date(a.t) - new Date(b.t)).map(view);
  const pre = by('pre'), post = by('post'), inn = by('in');
  const out = {};
  if (pre[0]) out.next = { t: pre[0].t, home: pre[0].home, opp: pre[0].opp };
  if (post.length) {
    const l = post[post.length - 1];
    out.last = { t: l.t, home: l.home, opp: l.opp, score: l.sc + '-' + l.osc, res: l.sc > l.osc ? 'V' : l.sc < l.osc ? 'P' : 'N' };
  }
  if (inn[0]) out.live = { score: inn[0].sc + '-' + inn[0].osc, clock: inn[0].clock, opp: inn[0].opp };
  return out;
}

module.exports = async (req, res) => {
  const errors = [], now = Date.now();
  const rng = ymd(new Date(now - 45 * 864e5)) + '-' + ymd(new Date(now + 120 * 864e5));
  const keys = Object.keys(LG);
  const jobs = [];
  for (const k of keys) {
    jobs.push(get(`${B}v2/sports/soccer/${LG[k]}/standings`).then(j => ({ k, kind: 's', v: groups(j) })));
    jobs.push(get(`${B}site/v2/sports/soccer/${LG[k]}/scoreboard?dates=${rng}&limit=1000`).then(j => ({ k, kind: 'e', v: events(j) })));
  }
  const rs = await Promise.allSettled(jobs);
  const S = {}, E = {};
  rs.forEach((r, i) => {
    const k = keys[Math.floor(i / 2)], kind = i % 2 ? 'partite' : 'classifica';
    if (r.status === 'fulfilled') (r.value.kind === 's' ? S : E)[k] = r.value.v;
    else errors.push(`${TIT[k]} ${kind}: ${r.reason && r.reason.message}`);
  });

  const tables = {}, teams = [];
  for (const k of keys) {
    const gs = S[k]; if (!gs) continue;
    const mine = [];
    let pick = null;
    for (const t of TEAMS) {
      const g = gs.find(g => g.rows.some(r => t.re.test(r.raw)));
      if (g) { pick = pick || g; mine.push(t.name); }
    }
    const g = pick || gs[0];
    tables[k] = { title: TIT[k], mine, rows: g.rows.map(r => [r.rk, r.n, r.pts, r.pl]) };
  }
  const evs = [].concat(...Object.values(E));
  for (const t of TEAMS) {
    const o = { id: t.id, name: t.name };
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
  res.status(200).json({ src: 'ESPN', ts: new Date(now).toISOString(), ttl, teams, tables, errors });
};
