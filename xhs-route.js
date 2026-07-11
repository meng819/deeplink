const xhsRoute = (req, res) => {
app.get('/api/xhs', async (req, res) => {
  try {
    const u = decodeURIComponent(req.query.url);
    const r = await fetch(u, {
      headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' }
    });
    const h = await r.text();
    const m = h.match(/window\.__INITIAL_STATE__\s*=\s*(\{[\s\S]*?\});/);
    if (!m) return res.json({success:false,error:'parse failed'});
    const s = JSON.parse(m[1]);
    const n = s.note?.noteData?.data?.noteData || s.note?.normalNotePreloadData;
    if (!n) return res.json({success:false,error:'no data'});
    res.json({success:true,data:{title:n.title||'',desc:(n.desc||'').slice(0,500),author:n.user?.nickname||'',imageCount:n.imageList?.length||0}});
  } catch (e) {res.status(500).json({error:e.message})}
});
};
module.exports = xhsRoute;