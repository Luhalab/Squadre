// Funzione di prova: legge una pagina Televideo e mostra il testo grezzo.
// Uso: /api/test?p=203   (203 = classifica Serie A, 210 = classifica Serie B)
module.exports = async (req, res) => {
  const p = String((req.query && req.query.p) || '203').replace(/\D/g, '').slice(0, 3);
  const url = `https://www.servizitelevideo.rai.it/televideo/pub/solotesto.jsp?pagina=${p}&sottopagina=1`;
  const t0 = Date.now();
  res.setHeader('content-type', 'text/plain; charset=utf-8');
  res.setHeader('cache-control', 's-maxage=30');
  try {
    const r = await fetch(url, {
      headers: { 'user-agent': 'Mozilla/5.0 (Squadre app personale)' },
      signal: AbortSignal.timeout(8000),
    });
    const html = await r.text();
    const m = html.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
    const txt = (m ? m[1] : html)
      .replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
    res.status(200).send(`status ${r.status} - ${Date.now() - t0} ms - ${html.length} byte - pre:${!!m}\n${url}\n\n${txt.slice(0, 3000)}`);
  } catch (e) {
    res.status(200).send('errore: ' + e.message + '\n' + url);
  }
};
