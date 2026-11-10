// /s/<id> (vercel.json rewrite → /api/share?id=<id>)
// 게임 페이지에 그 결과의 미리보기 태그(og:title, og:image …)를 붙여서 내려준다.
// 카카오톡 같은 메신저는 JS를 실행하지 않으니 태그를 서버에서 넣어야 결과 사진이 미리보기로 뜬다.
export const config = { runtime: "edge" };

const SUPA = "https://eocgviuowuumqigwzztj.supabase.co";
const KEY = "sb_publishable_sDaNqJtHafIOlGAMjr-WdA_Gj-x1-5o"; // 공개용 키 (읽기·추가만 가능)

const esc = (v) =>
    String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const fmt = (n) => Number(n).toLocaleString("en-US");
const setMeta = (html, re, tag) =>
    re.test(html) ? html.replace(re, () => tag) : html.replace("</head>", () => tag + "\n</head>");

export default async function handler(req) {
    const url = new URL(req.url);
    const origin = url.origin;
    const id = url.searchParams.get("id") || url.pathname.split("/")[2] || "";
    const home = new URL("/", origin);
    if (!/^[A-Za-z0-9]{10}$/.test(id)) return Response.redirect(home, 302);

    let row = null;
    try {
        const r = await fetch(
            `${SUPA}/rest/v1/shares?id=eq.${id}&select=name,score,title,title_en,spot,rank_n,rank_of`,
            { headers: { apikey: KEY } },
        );
        if (r.ok) row = (await r.json())[0] || null;
    } catch (e) {}
    if (!row) return Response.redirect(home, 302);

    const page = await fetch(new URL("/index.html", origin));
    if (!page.ok) return Response.redirect(home, 302);
    let html = await page.text();

    const title = `${row.name} ${fmt(row.score)}점 · ${row.title || ""}`;
    const rank = row.rank_n ? ` · 기록 당시 ${row.rank_n}위 (${row.rank_of}명 중)` : "";
    const desc = `보드를 타보자! 30초 롱보드 댄싱${rank}. 이 기록 이겨 봐! Beat ${row.name}'s ${fmt(row.score)}`;
    const img = `${SUPA}/storage/v1/object/public/cards/${id}.jpg`;
    const link = `${origin}/s/${id}`;

    html = html.replace(/<title>[^<]*<\/title>/, () => `<title>${esc(title)} · 보드를 타보자!</title>`);
    html = setMeta(html, /<meta name="description" content="[^"]*">/, `<meta name="description" content="${esc(desc)}">`);
    html = setMeta(html, /<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${esc(title)}">`);
    html = setMeta(html, /<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${esc(desc)}">`);
    html = setMeta(html, /<meta property="og:image" content="[^"]*">/, `<meta property="og:image" content="${esc(img)}">`);
    html = setMeta(html, /<meta property="og:url" content="[^"]*">/, `<meta property="og:url" content="${esc(link)}">`);
    html = setMeta(html, /<meta name="twitter:image" content="[^"]*">/, `<meta name="twitter:image" content="${esc(img)}">`);

    const data = JSON.stringify({
        name: row.name, score: row.score, title: row.title, title_en: row.title_en, spot: row.spot, rank_n: row.rank_n,
    }).replace(/</g, "\\u003c");
    html = html.replace("<body>", () => `<body>\n<script id="challenge-data" type="application/json">${data}</script>`);

    return new Response(html, {
        headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=60" },
    });
}
