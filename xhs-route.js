module.exports = function(app) {
app.get('/api/xhs', async (req, res) => {
  try {
    const url = decodeURIComponent(req.query.url);
    const r = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Referer': 'https://www.xiaohongshu.com/',
        'Connection': 'keep-alive',
        'Cache-Control': 'max-age=0'
      },
      redirect: 'follow'
    });
    const html = await r.text();
    const m = html.match(/window\.__INITIAL_STATE__\s*=\s*(\{[\s\S]*?\});/);
    if(m) {
      try {
        const s = JSON.parse(m[1]);
        const n = s.note?.noteData?.data?.noteData || s.note?.normalNotePreloadData;
        if(n) return res.json({success:true,data:{title:n.title,desc:(n.desc||'').slice(0,300),author:n.user?.nickname,imageCount:n.imageList?.length}});
      } catch(e) {}
    }
    const title = html.match(/<title>([^<]*)<\/title>/i);
    res.json({success:true,data:{title:title?title[1].trim():'',desc:'',note:'__INITIAL_STATE__不存在'}});
  } catch(e) {res.status(500).json({error:e.message})}
});
};