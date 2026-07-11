module.exports = function(app) {
app.get('/api/xhs', async (req, res) => {
  try {
    let url = decodeURIComponent(req.query.url);
    const r = await fetch(url, {headers:{'User-Agent':'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'},redirect:'follow'});
    const html = await r.text();
    const title = html.match(/<title>([^<]*)<\/title>/i);
    const desc = html.match(/<meta name=\"description\" content=\"([^\"]*)\"/i);
    const img = html.match(/<meta property=\"og:image\" content=\"([^\"]*)\"/i);
    res.json({success:true,data:{
      title:title ? title[1].trim() : '未知',
      desc:desc ? desc[1].trim().slice(0,300) : '',
      image:img ? img[1] : ''
    }});
  } catch(e) {res.status(500).json({error:e.message})}
});
};