// 📣 마케팅 탭: 대표가 메타 CSV를 올리면(데이터) → 스킬 pallo-meta-analyze 가 전산 리드와 합쳐 주간 리포트·페르소나를 저장 → 여기서 본다.
// 숫자 계산은 mk-core.js(MKCORE), 문장(notes·persona)은 스킬이 쓴다. 이 화면은 CSV 올리기와 보여주기만.
// index.html 의 sb·me·$·esc·toast·fail·isBoss·previewTeam·teams 를 씀 → window.MK
(() => {
const MK = (window.MK = { tab: "report", team: null, week: null });
const KIND = { ads_daily: ["mk_ad_daily", "team_id,date,ad_name", "광고 일별"], ads_demo: ["mk_ad_demo", "team_id,period_from,period_to,ad_name,age,gender", "광고 연령·성별"], organic: ["mk_organic", "team_id,platform,post_id", "인스타·페북 게시물"] };
const VERDICT = { keep: "🟢 계속", cut: "🔴 끄기", watch: "🟡 지켜보기", hold: "⚪ 보류" };
const V = () => document.getElementById("mkView");
const $m = (s) => V().querySelector(s);
const n = (v) => Number(v) || 0; // 리포트 JSON 은 스킬이 쓴 값이라, 화면에 넣는 숫자는 모두 숫자로 바꿔서 쓴다
const usd = (v) => (v === null || v === undefined ? "–" : "$" + (Math.round(n(v) * 100) / 100).toLocaleString("en-US"));
const pct = (v) => (Math.round(n(v) * 1000) / 10) + "%";
let parsed = [];

MK.load = async function () {
  if (MK.myTeam === undefined) MK.myTeam = (await sb.from("profiles").select("team_id").eq("user_id", me.id).single()).data?.team_id ?? null;
  const admin = isBoss && !previewTeam;
  if (admin) {
    try { MK.team = MK.team ?? (+localStorage.getItem("mk-team") || null); } catch {}
    if (!teams.some((t) => t.id === MK.team)) MK.team = teams[0]?.id ?? null;
  } else { MK.team = previewTeam || MK.myTeam; if (MK.tab === "upload") MK.tab = "report"; }
  V().innerHTML = `<div class="mkbar"><h2>📣 마케팅</h2>
    ${admin ? `<select id="mkTeam">${teams.map((t) => `<option value="${t.id}" ${t.id === MK.team ? "selected" : ""}>${esc(t.name)}</option>`).join("")}</select>` : ""}
    <div class="mktabs">${[["report", "주간 리포트"], ["persona", "페르소나"], ...(admin ? [["upload", "데이터 올리기"]] : [])].map(([k, t]) => `<button data-t="${k}" class="${MK.tab === k ? "on" : ""}">${t}</button>`).join("")}</div></div>
    <div id="mkBody"></div>`;
  $m("#mkTeam")?.addEventListener("change", (e) => { MK.team = +e.target.value; MK.week = null; try { localStorage.setItem("mk-team", MK.team); } catch {} MK.load(); });
  V().querySelectorAll(".mktabs button").forEach((b) => b.addEventListener("click", () => { MK.tab = b.dataset.t; MK.load(); }));
  if (!MK.team) { $m("#mkBody").innerHTML = `<div class="card">아직 지점이 정해지지 않았어요. 대표님이 [팀] 탭에서 지점을 정해 주시면 볼 수 있어요.</div>`; return; }
  if (MK.tab === "upload") return renderUpload();
  return renderReport(MK.tab === "persona" ? "persona" : "weekly");
};

// ── 리포트·페르소나 보기 ──
async function renderReport(kind) {
  const { data: list, error } = await sb.from("mk_reports").select("week, data, updated_at").eq("team_id", MK.team).eq("kind", kind).order("week", { ascending: false }).limit(12);
  if (fail(error)) return;
  if (!list?.length) { $m("#mkBody").innerHTML = `<div class="card">아직 ${kind === "weekly" ? "주간 리포트" : "페르소나"}가 없어요. 대표님이 데이터를 올리고 Claude에게 "메타 주간 분석 돌려줘"라고 하면 생겨요.</div>`; return; }
  const cur = list.find((r) => r.week === MK.week) ?? list[0]; MK.week = cur.week;
  const pick = `<select id="mkWeek">${list.map((r) => `<option value="${r.week}" ${r.week === cur.week ? "selected" : ""}>${esc(r.week)}${kind === "weekly" ? " 주" : " 월"}</option>`).join("")}</select>
    <span class="mut">갱신 ${esc(new Date(cur.updated_at).toLocaleString("ko-KR"))}</span>`;
  $m("#mkBody").innerHTML = `<div class="mkbar">${pick}</div>` + (kind === "weekly" ? weeklyHtml(cur.data) : personaHtml(cur.data));
  $m("#mkWeek").addEventListener("change", (e) => { MK.week = e.target.value; renderReport(kind); });
}

function weeklyHtml(d) {
  const f = d.flags ?? {}, t = d.totals ?? {}, nt = d.notes ?? {};
  const warns = [f.noAds && "광고 데이터 없음 — 이번 주 CSV가 안 올라왔어요", f.noLeads && "등록 데이터 누락 — 전산 리드를 못 읽어서 소재 판정을 보류했어요", f.noOrganic && "오가닉 데이터 없음"].filter(Boolean);
  const ads = (d.ads ?? []).map((a) => `<tr><td>${esc(a.ad_name)}${nt.ads?.[a.ad_name] ? `<div class="mut">${esc(nt.ads[a.ad_name])}</div>` : ""}</td>
    <td><span class="vd ${esc(a.verdict)}">${VERDICT[a.verdict] ?? esc(a.verdict)}</span><div class="mut">${esc(a.reason)}</div></td>
    <td>${usd(a.spend)}</td><td>${n(a.leads)}</td><td>${usd(a.cpl)}</td><td>${n(a.leads4w)}</td><td>${n(a.enrolls4w)}</td><td>${usd(a.cpe4w)}</td></tr>`).join("");
  const posts = (arr) => (arr ?? []).map((p) => `<tr><td>${String(p.permalink ?? "").startsWith("https://") ? `<a href="${esc(p.permalink)}" target="_blank" rel="noopener">${esc(p.caption || p.post_id)}</a>` : esc(p.caption || p.post_id)}<div class="mut">${esc(p.type)} · ${esc(p.published_at)}</div></td>
    <td>${n(p.reach).toLocaleString("ko-KR")}</td><td>${n(p.saves)}</td><td>${n(p.shares)}</td><td>${p.score == null ? "–" : pct(p.score)}</td></tr>`).join("");
  const ptable = (arr) => `<div class="tw"><table><tr><th>게시물</th><th>도달</th><th>저장</th><th>공유</th><th>저장+공유율</th></tr>${posts(arr)}</table></div>`;
  return warns.map((w) => `<div class="card warn">⚠️ ${esc(w)}</div>`).join("")
    + (nt.summary || nt.caution ? `<div class="card">${nt.summary ? `<b>이번 주 한 줄</b><p>${esc(nt.summary)}</p>` : ""}${nt.tests?.length ? `<b>새로 테스트할 방향</b><ul>${nt.tests.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}${nt.caution ? `<p class="mut">${esc(nt.caution)}</p>` : ""}</div>` : "")
    + `<div class="card kpis"><div class="kpi"><span class="mut">이번 주 지출</span><b>${usd(t.spend)}</b></div><div class="kpi"><span class="mut">이번 주 리드</span><b>${n(t.leads)}</b></div>
       <div class="kpi"><span class="mut">리드당 비용</span><b>${usd(t.cpl)}</b></div><div class="kpi"><span class="mut">4주 등록</span><b>${n(t.enrolls4w)}</b>${n(t.otherEnrolls4w) > 0 ? `<small class="mut">(광고 외 등록 ${n(t.otherEnrolls4w)})</small>` : ""}</div><div class="kpi"><span class="mut">4주 등록당 비용</span><b>${usd(t.cpe4w)}</b></div></div>`
    + `<div class="card"><b>소재 판정</b><div class="tw"><table><tr><th>광고</th><th>판정</th><th>이번 주 지출</th><th>리드</th><th>리드당</th><th>4주 리드</th><th>4주 등록</th><th>등록당</th></tr>${ads || `<tr><td colspan="8">광고 없음</td></tr>`}</table></div></div>`
    + `<div class="card"><b>오가닉 잘 된 게시물</b>${ptable(d.organic?.top)}</div><div class="card"><b>오가닉 아쉬운 게시물</b>${ptable(d.organic?.bottom)}</div>`;
}

function personaHtml(d) {
  const p = d.persona ?? {};
  const dist = (o) => Object.entries(o ?? {}).map(([k, v]) => `${esc(k)} ${n(v)}명`).join(" · ") || "–";
  return (d.borrowed ? `<div class="card warn">⚠️ 이 지점은 표본이 적어서 다른 지점 패턴을 빌려 썼어요 (표본 ${esc(d.sample)}건)</div>` : "")
    + `<div class="card"><h3>${esc(p.title ?? "페르소나")}</h3><p>${esc(p.who ?? "")}</p><p><b>원하는 것</b> ${esc(p.wants ?? "")}</p>
       ${p.messages?.length ? `<b>반응한 메시지</b><ul>${p.messages.map((m) => `<li>${esc(m)}</li>`).join("")}</ul>` : ""}
       <p><b>활동 시간</b> ${esc(p.times ?? "")}</p>${p.caution ? `<p class="mut">${esc(p.caution)}</p>` : ""}</div>`
    + `<div class="card"><b>근거 숫자</b><p class="mut">리드 → 상담 → 방문 → 등록: ${["lead", "consult", "visit", "enroll"].map((k) => n(d.funnel?.[k])).join(" → ")} (이탈 ${n(d.funnel?.lost)})</p>
       <p class="mut">등록자 나이대: ${dist(d.enrolledByAge)}</p><p class="mut">등록자 과목: ${dist(d.enrolledBySubject)}</p>
       <p class="mut">광고 리드 연령·성별: ${(d.leadsByAgeGender ?? []).slice(0, 6).map((x) => `${esc(x.age)} ${esc(x.gender)} ${pct(x.share)}`).join(" · ") || "–"}</p></div>`;
}

// ── CSV 올리기 (대표) ──
// 광고는 계정 하나를 4개 지점이 같이 써서, 행마다 mk-core 가 캠페인 이름으로 판별한 team_key 를 지점 id 로 바꾼다.
// 게시물(오가닉)은 지점 인스타·페북 계정별 파일이라 위에서 고른 지점으로 올린다.
const TEAM_RE = { dsr: /동성로/, jpcn: /일본어|중국어/, ulsan: /울산/, gumi: /구미/ };
const teamIdOf = (key) => teams.find((t) => TEAM_RE[key]?.test(t.name))?.id ?? null;
const teamName = (id) => teams.find((t) => t.id === +id)?.name ?? "";
const dateOf = (r) => r.date ?? r.period_from ?? r.published_at;
function assign(p) {
  if (p.kind === "organic") return { byTeam: { [MK.team]: p.rows }, unknown: [] };
  const byTeam = {}, unknown = [];
  for (const { team_key, ...r } of p.rows) { const id = teamIdOf(team_key); if (id) (byTeam[id] ??= []).push(r); else unknown.push(r); }
  return { byTeam, unknown };
}
const usable = (p) => p.kind && !p.missing.length && p.currency !== "KRW";

async function renderUpload() {
  const { data: ups } = await sb.from("mk_uploads").select("team_id, kind, filename, rows, date_from, date_to, created_at").order("created_at", { ascending: false }).limit(12);
  $m("#mkBody").innerHTML = `<div class="card"><b>CSV 올리기</b>
      <p class="mut">광고관리자 CSV(광고 일별 · 연령+성별, <b>캠페인 이름 열 포함</b>)는 캠페인 이름으로 지점을 자동으로 나눠요. 게시물(인사이트) CSV는 위에서 고른 <b>${esc(teamName(MK.team))}</b>으로 올라가요. 같은 줄은 덮어써서 여러 번 올려도 안전해요.</p>
      <input type="file" id="mkFiles" accept=".csv,text/csv" multiple><div id="mkPrev"></div></div>
    <div class="card"><b>최근 올린 파일</b>${(ups ?? []).map((u) => `<div class="mut">${esc(new Date(u.created_at).toLocaleString("ko-KR"))} · ${esc(teamName(u.team_id))} · ${esc(KIND[u.kind]?.[2] ?? u.kind)} · ${esc(u.filename)} · ${esc(u.rows)}줄 · ${esc(u.date_from ?? "")}~${esc(u.date_to ?? "")}</div>`).join("") || `<div class="mut">아직 없어요</div>`}</div>`;
  $m("#mkFiles").addEventListener("change", async (e) => {
    parsed = await Promise.all([...e.target.files].map(async (f) => ({ name: f.name, ...MKCORE.normalize(MKCORE.decode(await f.arrayBuffer())) })));
    $m("#mkPrev").innerHTML = parsed.map((p) => {
      if (!p.kind) return `<div class="card warn">❌ ${esc(p.name)}: 어떤 파일인지 모르겠어요. 광고 이름 / 게시물 ID 열이 있는 CSV인지 확인해 주세요.</div>`;
      if (p.currency === "KRW") return `<div class="card warn">❌ ${esc(p.name)}: 원화 파일이에요. 광고 계정 통화(달러)로 내보내 주세요.</div>`;
      const d = p.rows.map(dateOf).filter(Boolean).sort(), a = assign(p);
      const per = Object.entries(a.byTeam).map(([id, rows]) => `${esc(teamName(id))} ${rows.length}줄${p.kind === "organic" ? "" : ` ($${Math.round(rows.reduce((s, r) => s + r.spend, 0)).toLocaleString("en-US")})`}`).join(" · ");
      const unk = [...new Set(a.unknown.map((r) => r.campaign || r.ad_name))].slice(0, 5);
      return `<div class="card ${p.missing.length || a.unknown.length ? "warn" : ""}">✅ ${esc(p.name)} → ${KIND[p.kind][2]} ${p.rows.length}줄 (${esc(d[0] ?? "")}~${esc(d.at(-1) ?? "")})<div>${per}</div>
        ${a.unknown.length ? `<div>⚠️ 지점을 모르는 ${a.unknown.length}줄은 빼고 올려요 (예: ${unk.map(esc).join(", ")}). 캠페인 이름 열이 빠졌거나 이름에 지역이 없어요.</div>` : ""}
        ${p.missing.length ? `<div>⚠️ 못 찾은 열: ${esc(p.missing.join(", "))} — 광고관리자에서 이 열을 추가해 다시 내보내 주세요.</div>` : ""}</div>`;
    }).join("") + (parsed.some(usable) ? `<button class="btn" id="mkSend">올리기</button>` : "");
    $m("#mkSend")?.addEventListener("click", send);
  });
}

// 같은 광고 이름이 광고세트 여러 개에 걸쳐 CSV에 여러 줄 나오면 한 upsert 안에서 키가 겹쳐 Postgres 가 거부한다 → 키가 같은 줄을 먼저 합친다.
const NUM = ["impressions", "reach", "clicks", "leads", "spend"];
function mergeByKey(rows, onConflict, kind) {
  const keys = onConflict.split(","), map = new Map();
  for (const r of rows) {
    const k = JSON.stringify(keys.map((c) => r[c] ?? null)), prev = map.get(k);
    if (!prev) { map.set(k, { ...r }); continue; }
    if (kind === "organic") map.set(k, { ...r }); // 오가닉은 마지막 줄 우선
    else for (const f of NUM) if (f in r || f in prev) prev[f] = (prev[f] ?? 0) + (r[f] ?? 0); // 광고는 숫자 합산, 글자 칸은 첫 줄 유지
  }
  return [...map.values()];
}

async function send() {
  const btn = $m("#mkSend"); btn.disabled = true; btn.textContent = "올리는 중…";
  let excluded = 0;
  for (const p of parsed.filter(usable)) {
    const [table, onConflict] = KIND[p.kind], a = assign(p);
    excluded += a.unknown.length;
    for (const [id, list] of Object.entries(a.byTeam)) {
      const rows = mergeByKey(list.map((r) => ({ team_id: +id, ...r })), onConflict, p.kind);
      for (let i = 0; i < rows.length; i += 500) {
        const { error } = await sb.from(table).upsert(rows.slice(i, i + 500), { onConflict });
        if (fail(error)) { btn.disabled = false; btn.textContent = "다시 올리기"; return; }
      }
      const d = list.map(dateOf).filter(Boolean).sort();
      const { error } = await sb.from("mk_uploads").insert({ team_id: +id, kind: p.kind, filename: p.name, rows: rows.length, date_from: d[0] ?? null, date_to: d.at(-1) ?? null });
      if (fail(error)) { btn.disabled = false; btn.textContent = "다시 올리기"; return; }
    }
  }
  toast(`올렸어요${excluded ? ` (지점 모르는 ${excluded}줄 제외)` : ""}. Claude에게 \"메타 주간 분석 돌려줘\"라고 하면 리포트가 만들어져요.`);
  renderUpload();
}
})();
