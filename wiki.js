// 📖 백과사전 탭: "서류 어디서 받아?"처럼 물으면 플래너 기능(wiki-data.js WIKI)에서 찾아 보여 주고, [바로 가기]로 그 탭을 연다. 서버·AI 없음.
// index.html 의 isBoss·previewTeam·previewUser·setView·esc 를 씀 → window.WK
(() => {
const WK = (window.WK = { q: "" });
const V = () => document.getElementById("wkView");
// 질문에서 뺄 말 (조사·물음말) — 남은 낱말로 찾음
const STOP = /(은|는|이|가|을|를|에|에서|으로|로|와|과|랑|하고|도|만|좀|요|어디|어디서|어디에|어떻게|뭐|무엇|있어|있나요|있어요|해|해요|하나요|할까|돼|되나요|하는|하려면|하고싶어|싶어|방법|기능|알려줘|줘|나|내|우리)$/;
const words = (q) => q.toLowerCase().replace(/[?？!.,·]/g, " ").split(/\s+/).map((w) => { let x = w; for (let i = 0; i < 3 && x.length > 1 && STOP.test(x); i++) x = x.replace(STOP, ""); return x; }).filter((w) => w.length >= 2 && !/^(어디|어떻게|뭐|방법|기능)$/.test(w));
const score = (it, ws) => {
  const t = it.t.toLowerCase(), k = it.k.toLowerCase(), body = [it.what, it.at, ...(it.how ?? [])].join(" ").toLowerCase();
  let s = 0, hit = 0;
  for (const w0 of ws) {
    const f = (w) => (t.includes(w) ? 6 : 0) + (k.includes(w) ? 4 : 0) + (body.includes(w) ? 2 : 0);
    let v = f(w0); if (!v && w0.length >= 2) v = f(w0.slice(0, -1)) / 2; // "받아"→"받"(내려받기) 처럼 끝 글자 뗀 말로 한 번 더
    if (v) hit++; s += v;
  }
  return hit ? s + hit * 5 : 0; // 여러 낱말이 다 맞을수록 위로
};
const POP = ["서류 어디서 받아?", "할 일에 파일 첨부", "얼굴 모자이크", "시뮬레이션 기록", "리더 출석 체크", "조교 링크", "인스타 올리는 곳", "알람 켜기"];
WK.load = function () {
  const admin = isBoss && !previewTeam && !previewUser, list = WIKI.filter((x) => admin || x.who !== "admin");
  const ws = words(WK.q), hits = WK.q.trim() ? list.map((x) => [x, score(x, ws)]).filter(([, s]) => s > 0).sort((a, b) => b[1] - a[1]).filter(([, s], _, all) => s >= all[0][1] * 0.35).map(([x]) => x) : list; // 약하게 걸린 건 뺌
  const card = (x) => `<div class="wkcard"><div class="wkhead"><b>${esc(x.t)}</b>${x.v ? `<button class="btn small" data-wkgo="${x.v}">바로 가기 →</button>` : ""}</div>
      <div class="wkat">📍 ${esc(x.at)}</div><p>${esc(x.what)}</p>${x.how?.length ? `<ul>${x.how.map((h) => `<li>${esc(h)}</li>`).join("")}</ul>` : ""}</div>`;
  V().innerHTML = `<div class="wkbar"><h2>📖 백과사전</h2><span class="mut">플래너 어디에 뭐가 있는지 물어보세요</span></div>
    <form id="wkForm"><input id="wkQ" value="${esc(WK.q)}" placeholder="예) 서류 어디서 받아? · 할 일에 파일 첨부 · 출석 체크" autocomplete="off"><button class="btn">찾기</button></form>
    <div class="wkpop">${POP.map((p) => `<button type="button" data-wkq="${esc(p)}">${esc(p)}</button>`).join("")}</div>
    <div class="mut wkcount">${WK.q.trim() ? (hits.length ? `"${esc(WK.q)}" — ${hits.length}개 찾았어요` : `"${esc(WK.q)}" — 못 찾았어요. 다른 말로 물어보거나 아래 🐞 로 알려 주세요`) : `전체 기능 ${list.length}개`}</div>
    <div class="wklist">${hits.map(card).join("")}</div>`;
  const f = V().querySelector("#wkForm"), inp = V().querySelector("#wkQ");
  f.onsubmit = (e) => { e.preventDefault(); WK.q = inp.value; WK.load(); V().querySelector("#wkQ").focus(); };
  let t; inp.oninput = () => { clearTimeout(t); t = setTimeout(() => { WK.q = inp.value; const pos = inp.selectionStart; WK.load(); const n = V().querySelector("#wkQ"); n.focus(); n.setSelectionRange(pos, pos); }, 250); }; // 치는 대로 찾기
  V().querySelectorAll("[data-wkq]").forEach((b) => (b.onclick = () => { WK.q = b.dataset.wkq; WK.load(); }));
  V().querySelectorAll("[data-wkgo]").forEach((b) => (b.onclick = () => setView(b.dataset.wkgo)));
};
})();
