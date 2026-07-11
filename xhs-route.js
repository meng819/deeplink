module.exports = function(app) {
app.get('/api/xhs', async (req, res) => {
  try {
    const url = decodeURIComponent(req.query.url);
    const XHS_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
    const r = await fetch(url, {headers:{'User-Agent':XHS_UA},redirect:'follow'});
    const html = await r.text();
    const m = html.match(/window\.__INITIAL_STATE__\s*=\s*(\{[\s\S] ?\})\s*<\/script>/);
    if(!m) return res.json({success:false,error:'nocontent',htmlLen:html.length});
    const state = JSON.parse(m[1].replace(/undefined/g,'null'));
    let note = state?.noteData?.data?.noteData;
    if(!note && state?.note?.noteDetailMap) {
      const map = state.note.noteDetailMap;
      const k = Object.keys(map)[0];
      note = k ? map[k]?.note : null;
    }
    if(!note) return res.json({success:false,error:'no note'});
    res.json({success:true,data:{
      title:note.title||'',
      desc:(note.desc||'').slice(0,500),
      author:note.user?.nickName || note.user?.nickname ||'',
      likes:note.interactInfo?.likedCount || 0,
      comments:note.interactInfo?.commentCount || 0,
      imageCount:(note.imageList||[]).length
    }});
  } catch(e) {res.status(500).json({error:e.message})}
});
};