module.exports = function(app) {
app.get('/api/xhs', async (req, res) => {
  try {
    const url = decodeURIComponent(req.query.url);
    const r = await fetch(url, {headers:{'User-Agent':'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'},redirect:'follow'});
    const html = await r.text();
    const start = html.indexOf('__INITIAL_STATE__');
    const eqPos = html.indexOf('=',start);
    let b=0,js=-1,je=-1;
    for(let i=eqPos+1;i<html.length;i++){const c=html[i];if(c==='{'){if(js===-1)js=i;b++}else if(c==='}'){b--;if(b===0&&js!==-1){je=i;break}}}
    const state=JSON.parse(html.slice(js,je+1).replace(/undefined/g,'null'));
    let note=state?.noteData?.data?.noteData;
    if(!note&&state?.note?.noteDetailMap){const k=Object.keys(state.note.noteDetailMap)[0];note=k?state.note.noteDetailMap[k]?.note:null}
    const images=(note.imageList||[]).map(i=>{let u=i.urlDefault||i.url||'';if(u.startsWith('//'))u='https:'+u;return u}).filter(Boolean);
    res.json({success:true,data:{title:note.title||'',desc:(note.desc||'').slice(0,500),author:note.user?.nickName||note.user?.nickname||'',likes:note.interactInfo?.likedCount||0,comments:note.interactInfo?.commentCount||0,imageCount:images.length,images:images.slice(0,9)}});
  } catch(e){res.status(500).json({error:e.message})}
});
};