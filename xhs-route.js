module.exports = function(app) {
app.get('/api/xhs', async (req, res) => {
  try{
    const url=decodeURIComponent(req.query.url);
    const r=await fetch(url,{headers:{'User-Agent':'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'},redirect:'follow'});
    const html=await r.text();
    const s=html.indexOf('__INITIAL_STATE__');const e=html.indexOf('=',s);
    let b=0,js=-1,je=-1;
    for(let i=e+1;i<html.length;i++){const c=html[i];if(c==='{'){if(js===-1)js=i;b++}else if(c==='}'){b--;if(b===0&&js!==-1){je=i;break}}}
    const state=JSON.parse(html.slice(js,je+1).replace(/undefined/g,'null'));
    let note=state?.noteData?.data?.noteData;
    if(!note&&state?.note?.noteDetailMap){const k=Object.keys(state.note.noteDetailMap)[0];note=k?state.note.noteDetailMap[k]?.note:null}
    const img=(note.imageList||[]).slice(0,2).map(i=>Object.keys(i));
    res.json({success:true,imageCount:(note.imageList||[]).length,imageKeys:img});
  }catch(e){res.status(500).json({error:e.message})}
});
};