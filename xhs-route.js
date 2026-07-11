module.exports = function(app) {
app.get('/api/xhs', async (req, res) => {
  try {
    const url = decodeURIComponent(req.query.url);
    const r = await fetch(url, {headers:{'User-Agent':'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'},redirect:'follow'});
    const html = await r.text();
    const start = html.indexOf('__INITIAL_STATE__');
    if(start === -1) return res.json({success:false,error:'no state'});
    const eqPos = html.indexOf('=', start);
    if(eqPos === -1) return res.json({success:false,error:'no equals'});
    let braceCount = 0, jsonStart = -1, jsonEnd = -1;
    for(let i = eqPos + 1; i < html.length; i++) {
      const c = html[i];
      if(c === '{') { if(jsonStart === -1) jsonStart = i; braceCount++; }
      else if(c === '}') { braceCount--; if(braceCount === 0 && jsonStart !== -1) { jsonEnd = i; break; } }
    }
    if(jsonEnd === -1) return res.json({success:false,error:'parse failed'});
    const state = JSON.parse(html.slice(jsonStart, jsonEnd + 1).replace(/undefined/g,'null'));
    let note = state?.noteData?.data?.noteData;
    if(!note && state?.note?.noteDetailMap) {
      const k = Object.keys(state.note.noteDetailMap)[0];
      note = k ? state.note.noteDetailMap[k]?.note : null;
    }
    if(!note) return res.json({success:false,error:'no note'});
    res.json({success:true,data:{
      title:note.title||'',desc:(note.desc||'').slice(0,500),author:note.user?.nickName||note.user?.nickname||'',likes:note.interactInfo?.likedCount||0,comments:note.interactInfo?.commentCount||0,imageCount:(note.imageList||[]).length}});
  } catch(e) {res.status(500).json({error:e.message})}
});
};