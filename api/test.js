// Funzione di prova (solo lettura). Usi:
//  /api/test?p=203            pagina Televideo (203 = classifica A, 210 = classifica B)
//  /api/test?e=a&k=standings  ESPN: e = a (Serie A) | b (Serie B) | n (Nations League); k = standings | scoreboard
const E = { a: 'ita.1', b: 'ita.2', n: 'uefa.nations' };
const UA = { 'user-agent': 'Mozilla/5.0 (Squadre app personale)' };

function sumStand(j) {
  return (j.children || []).map(c => (c.name || '?') + ':\n' +
    ((c.standings && c.standings.entries) || []).slice(0, 25).map(x => {
      const pt = (x.stats || []).find(s => s.name === 'points');
      return ' ' + ((x.team && x.team.displayName) || '?') + ' ' + (pt ? pt.value : '?');
    }).join('\n')).join('\n');
}
function sumBoard(j) {
  return (j.events || []).slice(0, 15).map(e => {
    const c = (e.competitions && e.competitions[0] && e.competitions[0].competitors) || [];
    const sc = c.map(x => ((x.team && x.team.abbreviation) || '?') + ' ' + (x.score || '-')).join(' vs ');
    return (e.date || '') + ' | ' + sc + ' | ' + ((e.status && e.status.type && e.status.type.description) || '');
  }).join('\n');
}

module.exports = async (req, res) => {
  const q = req.query || {};
  res.setHeader('content-type', 'text/plain; charset=utf-8');
  res.setHeader('cache-control', 's-maxage=30');
  const t0 = Date.now();
  let url;
  try {
    if (q.e) {
      const lg = E[q.e];
      if (!lg) return res.status(200).send('parametro e non valido (a, b, n)');
      url = q.k === 'scoreboard'
        ? `https://site.api.espn.com/apis/site/v2/sports/soccer/${lg}/scoreboard`
        : `https://site.api.espn.com/apis/v2/sports/soccer/${lg}/standings`;
      const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(8000) });
      const raw = await r.text();
      let body;
      try { const j = JSON.parse(raw); body = q.k === 'scoreboard' ? sumBoard(j) : sumStand(j); }
      catch (e) { body = 'JSON non valido: ' + raw.slice(0, 300); }
      return res.status(200).send(`ESPN ${q.e}/${q.k || 'standings'} - status ${r.status} - ${Date.now() - t0} ms - ${raw.length} byte\n${(body || '(vuoto)').slice(0, 1500)}`);
    }
    const p = String(q.p || '203').replace(/\D/g, '').slice(0, 3);
    url = `https://www.servizitelevideo.rai.it/televideo/pub/solotesto.jsp?pagina=${p}&sottopagina=1`;
    const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(8000) });
    const html = await r.text();
    const m = html.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
    const txt = (m ? m[1] : html).replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
    res.status(200).send(`Televideo ${p} - status ${r.status} - ${Date.now() - t0} ms - ${html.length} byte - pre:${!!m}\n${txt.slice(0, 1500)}`);
  } catch (e) {
    res.status(200).send('errore: ' + e.message + '\n' + (url || ''));
  }
};
