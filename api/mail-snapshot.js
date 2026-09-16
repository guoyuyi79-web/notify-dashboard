const GMAIL = 'https://gmail.googleapis.com/gmail/v1/users/me';
const b64 = (s) => Buffer.from(String(s || '').replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
function rows(matrix) { if (!Array.isArray(matrix) || !matrix.length) return []; const h=matrix[0].map(x=>String(x||'').trim()); return matrix.slice(1).filter(r=>r.some(x=>x!==''&&x!=null)).map(r=>Object.fromEntries(h.map((k,i)=>[k,r[i]]))); }
function allParts(p, out=[]) { if (!p) return out; out.push(p); (p.parts||[]).forEach(x=>allParts(x,out)); return out; }
async function token() {
  const body=new URLSearchParams({client_id:process.env.GMAIL_CLIENT_ID||'',client_secret:process.env.GMAIL_CLIENT_SECRET||'',refresh_token:process.env.GMAIL_REFRESH_TOKEN||'',grant_type:'refresh_token'});
  const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body}); const j=await r.json(); if(!r.ok) throw new Error('Gmail OAuth failed: '+(j.error_description||j.error)); return j.access_token;
}
async function gmail(path, access) { const r=await fetch(GMAIL+path,{headers:{Authorization:'Bearer '+access}}); const j=await r.json(); if(!r.ok) throw new Error('Gmail API failed: '+(j.error&&j.error.message||r.status)); return j; }
function meta(overview,scenario,ad,funnel,feature) {
  const pick=(key)=>[...new Set([overview,scenario,ad,funnel,feature].flat().map(x=>String(x[key]||'').trim()).filter(x=>x&&x!=='全部'))];
  return {projects:pick('项目代号'),countries:pick('国家'),brands:pick('设备品牌'),versions:pick('版本'),periods:pick('日期'),cohortDays:pick('队列天数'),viewTypes:pick('查看类型'),adPlaces:pick('广告位'),adNetworks:pick('上报广告中介'),funnelNames:pick('漏斗名称'),overviewRows:overview.length,scenarioRows:scenario.length,adRows:ad.length,funnelRows:funnel.length,featureRows:feature.length,sourceCount:1};
}
module.exports=async function(req,res){
  res.setHeader('Access-Control-Allow-Origin','*');
  try {
    if(!process.env.GMAIL_CLIENT_ID||!process.env.GMAIL_CLIENT_SECRET||!process.env.GMAIL_REFRESH_TOKEN) throw new Error('Missing Gmail API environment variables');
    const access=await token(); const q=encodeURIComponent('to:guoyuyi@sinozo.com subject:PANEL_SNAPSHOT has:attachment');
    const list=await gmail('/messages?maxResults=10&q='+q,access); if(!list.messages||!list.messages.length) throw new Error('No PANEL_SNAPSHOT email found');
    let snapshot, messageId;
    for(const m of list.messages){ const msg=await gmail('/messages/'+m.id+'?format=full',access); const part=allParts(msg.payload).find(p=>String(p.filename||'').includes('_panel_snapshot_')&&p.body&&p.body.attachmentId); if(!part) continue; const a=await gmail('/messages/'+m.id+'/attachments/'+part.body.attachmentId,access); snapshot=JSON.parse(b64(a.data)); messageId=m.id; break; }
    if(!snapshot||snapshot.schema!=='notify-panel-snapshot/v1') throw new Error('Latest matching email has no valid snapshot JSON');
    const s=snapshot.sheets||{},overview=rows(s.panel_overview),scenario=rows(s.panel_scenario),ad=rows(s.panel_ad),funnel=rows(s.panel_funnel),feature=rows(s.panel_feature);
    res.setHeader('Cache-Control','s-maxage=3600, stale-while-revalidate=300');
    return res.status(200).json({ok:true,source:'gmail',generatedAt:snapshot.generatedAt,batchHour:snapshot.batchHour,timezone:snapshot.timezone,timezoneNote:snapshot.timezoneNote,messageId,meta:meta(overview,scenario,ad,funnel,feature),sources:[{mailbox:'guoyuyi@sinozo.com',projectCode:snapshot.projectCode}],errors:[],overview,scenario,ad,funnel,feature});
  } catch(e) { return res.status(500).json({ok:false,error:String(e.message||e)}); }
};
