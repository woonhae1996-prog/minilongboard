// /s/<id> : the game page, with link-preview tags for one shared result
const SUPA = 'https://eocgviuowuumqigwzztj.supabase.co';
const KEY = 'sb_publishable_sDaNqJtHafIOlGAMjr-WdA_Gj-x1-5o';
const SITE = 'https://minilongbd.netlify.app';

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => Number(n).toLocaleString('en-US');
const setMeta = (html, re, tag) => (re.test(html) ? html.replace(re, () => tag) : html.replace('</head>', () => tag + '\n</head>'));

export default async (req) => {
  const url = new URL(req.url);
  const id = url.pathname.split('/')[2] || '';
  const home = new URL('/', url);
  if (!/^[A-Za-z0-9]{10}$/.test(id)) return Response.redirect(home, 302);

  let row = null;
  try {
    const r = await fetch(`${SUPA}/rest/v1/shares?id=eq.${id}&select=name,score,title,title_en,spot,rank_n,rank_of`, { headers: { apikey: KEY } });
    if (r.ok) row = (await r.json())[0] || null;
  } catch (e) {}
  if (!row) return Response.redirect(home, 302);

  const page = await fetch(new URL('/index.html', url));
  if (!page.ok) return Response.redirect(home, 302);
  let html = await page.text();

  const title = `${row.name} ${fmt(row.score)}점 · ${row.title || ''}`;
  const rank = row.rank_n ? ` · 기록 당시 ${row.rank_n}위 (${row.rank_of}명 중)` : '';
  const desc = `보드를 타보자! 30초 롱보드 댄싱${rank}. 이 기록 이겨 봐! Beat ${row.name}'s ${fmt(row.score)}`;
  const img = `${SUPA}/storage/v1/object/public/cards/${id}.jpg`;
  const link = `${SITE}/s/${id}`;

  html = html.replace(/<title>[^<]*<\/title>/, () => `<title>${esc(title)} · 보드를 타보자!</title>`);
  html = setMeta(html, /<meta name="description" content="[^"]*">/, `<meta name="description" content="${esc(desc)}">`);
  html = setMeta(html, /<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${esc(title)}">`);
  html = setMeta(html, /<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${esc(desc)}">`);
  html = setMeta(html, /<meta property="og:image" content="[^"]*">/, `<meta property="og:image" content="${esc(img)}">`);
  html = setMeta(html, /<meta property="og:url" content="[^"]*">/, `<meta property="og:url" content="${esc(link)}">`);
  html = setMeta(html, /<meta name="twitter:image" content="[^"]*">/, `<meta name="twitter:image" content="${esc(img)}">`);

  const data = JSON.stringify({ name: row.name, score: row.score, title: row.title, title_en: row.title_en, spot: row.spot, rank_n: row.rank_n })
    .replace(/</g, '\\u003c');
  html = html.replace('<body>', () => `<body>\n<script id="challenge-data" type="application/json">${data}</script>`);

  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=60' } });
};

export const config = { path: '/s/*' };
