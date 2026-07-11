module.exports = function(app) {
app.get('/api/xhs', async (req, res) => {
  try {
    const url = decodeURIComponent(req.query.url);
    const r = await fetch(url, {headers:{'User-Agent':'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'},redirect:'follow'});
    const html = await r.text();
    const idx = html.indexOf('__INITIAL_STATE__');
    res.json({success:true,htmlLen:html.length,found:idx !== -1,position:idx,near:idx !== -1 ? html.slice(Math.max(0,idx - 50),idx + 100) : 'not found'});
  } catch(e) {res.status(500).json({error:e.message})}
});
};