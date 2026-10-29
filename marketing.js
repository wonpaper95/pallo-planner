// 📣 마케팅 탭: 대표가 메타 CSV를 올리면(데이터) → 스킬 pallo-meta-analyze 가 전산 리드와 합쳐 주간 리포트·페르소나를 저장 → 여기서 본다.
// 숫자 계산은 mk-core.js(MKCORE), 문장(notes·persona)은 스킬이 쓴다. 이 화면은 CSV 올리기와 보여주기만.
// index.html 의 sb·me·$·esc·toast·fail·isBoss·previewTeam·teams 를 씀 → window.MK
(() => {
const MK = (window.MK = { tab: "report", team: null, week: null, grp: null, ctab: "today", cday: null });
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
    <div class="mktabs">${[["report", "주간 리포트"], ["persona", "페르소나"], ["compet", "경쟁사"], ["agent", "🤖 에이전트"], ...(admin ? [["upload", "데이터"]] : [])].map(([k, t]) => `<button data-t="${k}" class="${MK.tab === k ? "on" : ""}">${t}</button>`).join("")}</div></div>
    <div id="mkBody"></div>`;
  $m("#mkTeam")?.addEventListener("change", (e) => { MK.team = +e.target.value; MK.week = null; try { localStorage.setItem("mk-team", MK.team); } catch {} MK.load(); });
  V().querySelectorAll(".mktabs button").forEach((b) => b.addEventListener("click", () => { MK.tab = b.dataset.t; MK.load(); }));
  if (MK.tab === "compet") return renderCompet(admin);
  if (MK.tab === "agent") return renderAgent(admin);
  if (!MK.team) { $m("#mkBody").innerHTML = `<div class="card">아직 지점이 정해지지 않았어요. 대표님이 [팀] 탭에서 지점을 정해 주시면 볼 수 있어요.</div>`; return; }
  if (MK.tab === "upload") return renderUpload();
  return renderReport(MK.tab === "persona" ? "persona" : "weekly");
};

// ── 리포트·페르소나 보기 ──
async function renderReport(kind) {
  const { data: list, error } = await sb.from("mk_reports").select("week, data, updated_at").eq("team_id", MK.team).eq("kind", kind).order("week", { ascending: false }).limit(12);
  if (fail(error)) return;
  if (!list?.length) { $m("#mkBody").innerHTML = `<div class="card">아직 ${kind === "weekly" ? "주간 리포트" : "페르소나"}가 없어요. 매주 월요일 아침 자동으로 생겨요(급하면 Claude에게 "메타 주간 분석 돌려줘").</div>`; return; }
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

// ── 경쟁사 광고 정찰 (mkc_*) ──
// 맥미니 수집기(scripts/mkc/collect.mjs)가 광고 라이브러리에서 읽은 걸 보여주고, 대표가 경쟁사 후보를 켜고 끈다. 그룹 = en(영어회화) / jpcn(일본어·중국어).
const GRP = { en: "영어회화 (구미·대구동성로·울산)", jpcn: "일본어·중국어 (대구일중)" };
const CSTAT = { on: "✅ 켜짐", candidate: "🟡 후보", off: "⚫ 꺼짐" };
const days = (d, today) => (d ? MKCCORE.daysBetween(d, today) : null);
async function renderCompet(admin) {
  const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  if (admin) { try { MK.grp = MK.grp ?? localStorage.getItem("mk-grp") ?? "en"; } catch { MK.grp ??= "en"; } }
  else {
    const name = teams.find((t) => t.id === MK.team)?.name ?? (await sb.from("teams").select("name").eq("id", MK.team).maybeSingle()).data?.name;
    if (!name) { $m("#mkBody").innerHTML = `<div class="card">아직 지점이 정해지지 않았어요. 대표님이 [팀] 탭에서 지점을 정해 주시면 볼 수 있어요.</div>`; return; }
    MK.grp = MKCCORE.groupOfTeamName(name);
  }
  if (!GRP[MK.grp]) MK.grp = "en";
  const grp = MK.grp;
  const head = `<div class="mkbar">${admin ? `<select id="mkGrp">${Object.entries(GRP).map(([k, v]) => `<option value="${k}" ${k === grp ? "selected" : ""}>${v}</option>`).join("")}</select>` : `<b>${GRP[grp]}</b>`}
      <div class="mktabs">${[["today", "오늘"], ["creative", "주간 추천"], ["list", "경쟁사 목록"]].map(([k, t]) => `<button data-c="${k}" class="${MK.ctab === k ? "on" : ""}">${t}</button>`).join("")}</div></div>`;
  const wire = () => {
    $m("#mkGrp")?.addEventListener("change", (e) => { MK.grp = e.target.value; MK.cday = null; try { localStorage.setItem("mk-grp", MK.grp); } catch {} MK.load(); });
    V().querySelectorAll(".mktabs button[data-c]").forEach((b) => b.addEventListener("click", () => { MK.ctab = b.dataset.c; MK.load(); }));
  };
  if (MK.ctab === "today") return renderToday(grp, head, wire);
  if (MK.ctab === "creative") return renderCreative(grp, head, wire);
  const [cq, aq, rq] = await Promise.all([
    sb.from("mkc_competitors").select("id, page_name, page_id, page_url, team_id, status, note, found_by").eq("grp", grp).order("page_name"),
    sb.from("mkc_ads").select("library_id, page_name, page_id, competitor_id, start_date, first_seen, active, thumb_path, multi_version, n_ads, keywords").eq("grp", grp).eq("active", true),
    sb.from("mkc_runs").select("run_date, status, counts, error").eq("grp", grp).order("id", { ascending: false }).limit(1),
  ]);
  if (fail(cq.error) || fail(aq.error) || fail(rq.error)) return;
  const comps = cq.data ?? [], ads = aq.data ?? [], run = rq.data?.[0];
  // 경쟁사별 광고 묶기 (competitor_id 또는 이름·page_id 일치) — 우리 지점 페이지는 뺀다
  const adsOf = (c) => ads.filter((a) => a.competitor_id === c.id || a.page_name === c.page_name || (c.page_id && a.page_id === c.page_id));
  const stat = (list) => {
    const vs = list.map((a) => MKCCORE.verdict(a, today)), oldest = list.map((a) => a.start_date).filter(Boolean).sort()[0] ?? null;
    const best = [...list].sort((a, b) => (a.start_date ?? "9").localeCompare(b.start_date ?? "9"))[0];
    return { n: list.length, oldest, days: days(oldest, today), core: vs.filter((v) => v === "core").length, proven: vs.filter((v) => v === "proven").length, fresh: vs.filter((v) => v === "new").length, thumb: list.find((a) => a.thumb_path)?.thumb_path ?? best?.thumb_path ?? null, sample: best };
  };
  const known = new Set(comps.flatMap((c) => adsOf(c).map((a) => a.library_id)));
  const others = new Map(); // 아직 목록에 없는 페이지 (키워드로만 본 것)
  for (const a of ads) { if (known.has(a.library_id) || MKCCORE.isOwnPage(a.page_name) || !a.page_name) continue; (others.get(a.page_name) ?? others.set(a.page_name, []).get(a.page_name)).push(a); }
  const otherRows = [...others.entries()].map(([page_name, list]) => ({ page_name, page_id: list[0].page_id, ...stat(list) })).filter((r) => r.n >= 2 || r.core + r.proven >= 1).sort((a, b) => b.n - a.n || (b.days ?? 0) - (a.days ?? 0)).slice(0, 15);
  const rows = comps.map((c) => ({ ...c, ...stat(adsOf(c)) }));
  // 썸네일 서명 주소 (비공개 버킷)
  const paths = [...new Set([...rows, ...otherRows].map((r) => r.thumb).filter(Boolean))];
  const signed = {};
  if (paths.length) { const { data } = await sb.storage.from("mkc-thumbs").createSignedUrls(paths, 3600); for (const x of data ?? []) if (x.signedUrl && !x.error) signed[x.path ?? paths[data.indexOf(x)]] = x.signedUrl; }
  const teamName = (id) => teams.find((t) => t.id === id)?.name ?? "";
  const libUrl = (r) => r.page_url || MKCCORE.competitorUrl(r);
  const row = (r, acts) => `<div class="cmp">${r.thumb && signed[r.thumb] ? `<img src="${esc(signed[r.thumb])}" alt="" loading="lazy">` : `<div class="cmp-no"></div>`}
    <div class="cmp-b"><div><a href="${esc(libUrl(r))}" target="_blank" rel="noopener"><b>${esc(r.page_name)}</b></a> ${r.team_id ? `<span class="tag">${esc(teamName(r.team_id))}</span>` : `<span class="tag mut">전국·온라인</span>`}</div>
      <div class="mut">활성 광고 ${r.n}개${r.days != null ? ` · 가장 오래 ${r.days}일째` : ""} · 🏆 ${r.core} 🟢 ${r.proven} 🆕 ${r.fresh}${r.found_by ? ` · ${esc(r.found_by)}` : ""}</div>${r.note ? `<div class="mut">📝 ${esc(r.note)}</div>` : ""}</div>
    ${admin ? `<div class="acts">${acts}</div>` : ""}</div>`;
  const btn = (id, st, label) => `<button class="sm" data-id="${id}" data-st="${st}">${label}</button>`;
  const section = (st, list, empty) => `<div class="card"><b>${CSTAT[st]} ${list.length}</b>${list.length ? list.map((r) => row(r, [st !== "on" && btn(r.id, "on", "켜기"), st !== "candidate" && btn(r.id, "candidate", "후보로"), st !== "off" && btn(r.id, "off", "끄기")].filter(Boolean).join(""))).join("") : `<div class="mut">${empty}</div>`}</div>`;
  const by = (st) => rows.filter((r) => r.status === st).sort((a, b) => b.n - a.n);
  $m("#mkBody").innerHTML = head + `<div class="mkbar"><span class="mut">${run ? `마지막 수집 ${esc(run.run_date)} · ${run.status === "ok" ? "정상" : run.status === "partial" ? "일부 실패" : "실패"} · 오늘 본 광고 ${n(run.counts?.cards)}개 · 처음 본 ${n(run.counts?.new)}개 · 종료 ${n(run.counts?.ended)}개` : "아직 수집 전이에요 (맥미니가 매일 새벽에 읽어요)"}</span></div>
    <p class="mut">메타 광고 라이브러리(공개)에서 읽은 활성 광고예요. 성과 숫자는 안 보여서 <b>집행 기간</b>으로 추정해요: 🏆 30일+ 또는 여러 버전 · 🟢 14일+ · 🆕 7일 안에 처음 봄. 이름을 누르면 라이브러리에서 원본을 볼 수 있어요.</p>
    ${admin ? `<div class="card"><b>직접 추가</b> <span class="mut">광고 라이브러리의 페이지 링크(view_all_page_id=…)나 페이지 이름</span><div class="mkbar"><input id="mkAddUrl" placeholder="https://www.facebook.com/ads/library/?…view_all_page_id=123 또는 페이지 이름" style="flex:1;min-width:240px"><button class="btn" id="mkAdd">켜진 경쟁사로 추가</button></div></div>` : ""}
    ${section("on", by("on"), "아직 켠 경쟁사가 없어요. 후보에서 골라 켜 주세요.")}
    ${section("candidate", by("candidate"), "후보가 없어요. 아래 '키워드로만 본 페이지'에서 올리거나, Claude에게 \"경쟁사 후보 올려줘\"라고 하면 돼요.")}
    <div class="card"><b>키워드로만 본 페이지</b> <span class="mut">아직 목록에 없는 광고주 (광고 2개+ 또는 14일+ 집행)</span>${otherRows.length ? otherRows.map((r) => row(r, `<button class="sm" data-add="${esc(r.page_name)}" data-pid="${esc(r.page_id ?? "")}">후보로 올리기</button>`)).join("") : `<div class="mut">없어요</div>`}</div>
    ${section("off", by("off"), "없어요")}`;
  wire();
  if (!admin) return;
  $m("#mkBody").querySelectorAll("button[data-st]").forEach((b) => b.addEventListener("click", async () => {
    b.disabled = true;
    const { error } = await sb.from("mkc_competitors").update({ status: b.dataset.st, updated_at: new Date().toISOString() }).eq("id", +b.dataset.id);
    if (!fail(error)) MK.load();
  }));
  const addComp = async (page_name, page_id, status, found_by) => {
    const { error } = await sb.from("mkc_competitors").insert({ grp, page_name, page_id, page_url: MKCCORE.pageUrl(page_id) ?? "", status, found_by });
    if (error?.code === "23505") return toast("이미 목록에 있어요");
    if (!fail(error)) { toast(`${page_name} 추가했어요`); MK.load(); }
  };
  $m("#mkBody").querySelectorAll("button[data-add]").forEach((b) => b.addEventListener("click", () => { b.disabled = true; addComp(b.dataset.add, b.dataset.pid, "candidate", "대표가 목록에서 올림"); }));
  $m("#mkAdd")?.addEventListener("click", () => {
    const v = $m("#mkAddUrl").value.trim(); if (!v) return;
    const pid = v.match(/view_all_page_id=(\d+)/)?.[1] ?? v.match(/^https?:\/\/(?:www\.)?facebook\.com\/(\d+)\/?$/)?.[1] ?? "";
    const name = pid ? (ads.find((a) => a.page_id === pid)?.page_name ?? `페이지 ${pid}`) : v;
    if (/^https?:/.test(v) && !pid) return toast("링크에서 페이지 번호(view_all_page_id)를 못 찾았어요");
    addComp(name, pid, "on", "대표가 직접 추가");
  });
}

// 오늘: 맥미니가 새벽에 저장한 일일 리포트(mkc_reports kind=daily). 숫자는 build-daily.mjs, 문장(notes)은 스킬이 쓴다.
const VD = MKCCORE.VERDICT_LABEL;
async function renderToday(grp, head, wire) {
  const { data: list, error } = await sb.from("mkc_reports").select("day, data, updated_at").eq("grp", grp).eq("kind", "daily").order("day", { ascending: false }).limit(14);
  if (fail(error)) return;
  if (!list?.length) { $m("#mkBody").innerHTML = head + `<div class="card">아직 일일 리포트가 없어요. 맥미니가 매일 새벽 5시에 광고 라이브러리를 읽고 만들어요. 경쟁사 목록에서 후보를 켜 두면 그 페이지는 전부 읽어요.</div>`; wire(); return; }
  const cur = list.find((r) => r.day === MK.cday) ?? list[0]; MK.cday = cur.day;
  const d = cur.data ?? {}, t = d.totals ?? {}, nt = d.notes ?? {}, f = d.flags ?? {};
  const paths = [...new Set([...(d.new ?? []), ...(d.ended ?? []), ...(d.top ?? [])].map((a) => a.thumb_path).filter(Boolean))];
  const signed = {};
  if (paths.length) { const { data } = await sb.storage.from("mkc-thumbs").createSignedUrls(paths, 3600); (data ?? []).forEach((x, i) => { if (x.signedUrl && !x.error) signed[x.path ?? paths[i]] = x.signedUrl; }); }
  const adRow = (a) => `<div class="cmp">${a.thumb_path && signed[a.thumb_path] ? `<img src="${esc(signed[a.thumb_path])}" alt="" loading="lazy">` : `<div class="cmp-no"></div>`}
    <div class="cmp-b"><div><a href="${esc(a.url)}" target="_blank" rel="noopener"><b>${esc(a.page_name)}</b></a> <span class="vd ${esc(a.verdict)}">${VD[a.verdict] ?? esc(a.verdict)}</span>${a.competitor === "on" ? `<span class="tag">켜진 경쟁사</span>` : a.competitor === "candidate" ? `<span class="tag mut">후보</span>` : ""}</div>
      <div>${esc(a.hook || a.headline || "(문구 없음)")}</div>
      <div class="mut">${a.days != null ? `${n(a.days)}일째` : "시작일 모름"} · ${esc(a.media_type || "?")}${a.multi_version ? " · 여러 버전" : ""}${n(a.n_ads) > 1 ? ` · 광고 ${n(a.n_ads)}개` : ""}${a.cta ? ` · ${esc(a.cta)}` : ""}${a.landing_domain ? ` · ${esc(a.landing_domain)}` : ""}</div></div></div>`;
  const section = (title, arr, empty) => `<div class="card"><b>${title} ${(arr ?? []).length}</b>${(arr ?? []).length ? arr.map(adRow).join("") : `<div class="mut">${empty}</div>`}</div>`;
  const warns = [f.noRun && "이날 수집 기록이 없어요", f.failed && "이날 수집이 실패했어요 (라이브러리가 막혔거나 화면이 바뀜)", f.partial && "일부 검색어 수집이 실패했어요", f.firstDay && "첫 수집일이라 '처음 본 광고'가 전부예요"].filter(Boolean);
  $m("#mkBody").innerHTML = head + `<div class="mkbar"><select id="mkDay">${list.map((r) => `<option value="${r.day}" ${r.day === cur.day ? "selected" : ""}>${esc(r.day)}</option>`).join("")}</select><span class="mut">갱신 ${esc(new Date(cur.updated_at).toLocaleString("ko-KR"))}</span></div>`
    + warns.map((w) => `<div class="card warn">⚠️ ${esc(w)}</div>`).join("")
    + (nt.summary || nt.trend?.length ? `<div class="card">${nt.summary ? `<b>오늘 한 줄</b><p>${esc(nt.summary)}</p>` : ""}${nt.trend?.length ? `<b>읽히는 흐름</b><ul>${nt.trend.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}${nt.caution ? `<p class="mut">${esc(nt.caution)}</p>` : ""}</div>` : "")
    + `<div class="card kpis"><div class="kpi"><span class="mut">활성 경쟁 광고</span><b>${n(t.active)}</b></div><div class="kpi"><span class="mut">처음 본 광고</span><b>${n(t.new)}</b></div><div class="kpi"><span class="mut">종료</span><b>${n(t.ended)}</b></div><div class="kpi"><span class="mut">켜진 경쟁사</span><b>${n(t.competitorsOn)}</b></div><div class="kpi"><span class="mut">우리 광고</span><b>${n(t.own)}</b></div></div>`
    + ((d.competitors ?? []).length ? `<div class="card"><b>켜진 경쟁사</b><div class="tw"><table><tr><th>경쟁사</th><th>활성</th><th>오늘 신규</th><th>오늘 종료</th><th>🏆 30일+</th><th>가장 오래</th></tr>${d.competitors.map((c) => `<tr><td>${esc(c.page_name)}</td><td>${n(c.active)}</td><td>${n(c.new_today)}</td><td>${n(c.ended_today)}</td><td>${n(c.core)}</td><td>${c.oldest_days != null ? `${n(c.oldest_days)}일` : "–"}</td></tr>`).join("")}</table></div></div>` : "")
    + section("🆕 처음 본 광고", d.new, "없어요")
    + section("⚫ 종료된 광고", d.ended, "없어요")
    + section("🏆 오래 도는 소재 TOP", d.top, "아직 없어요")
    + `<div class="card"><b>형식·CTA 분포</b><p class="mut">형식: ${(t.byMedia ?? []).map((x) => `${esc(x.key)} ${n(x.count)}`).join(" · ") || "–"}</p><p class="mut">CTA: ${(t.byCta ?? []).map((x) => `${esc(x.key)} ${n(x.count)}`).join(" · ") || "–"}</p><p class="mut">랜딩: ${(t.byLanding ?? []).map((x) => `${esc(x.key)} ${n(x.count)}`).join(" · ") || "–"}</p></div>`;
  wire();
  $m("#mkDay").addEventListener("change", (e) => { MK.cday = e.target.value; MK.load(); });
}

// 주간 추천: 월요일 스킬이 경쟁사 패턴 × 우리 판정으로 쓴 소재 3~5개(mkc_reports kind=creative). 카피·타겟은 복사해서 광고관리자에 붙인다.
async function renderCreative(grp, head, wire) {
  const { data: list, error } = await sb.from("mkc_reports").select("day, data, updated_at").eq("grp", grp).eq("kind", "creative").order("day", { ascending: false }).limit(12);
  if (fail(error)) return;
  if (!list?.length) { $m("#mkBody").innerHTML = head + `<div class="card">아직 추천이 없어요. 매주 월요일 새벽에 경쟁사 패턴과 우리 주간 판정을 교차해서 소재 3~5개를 올려요. 급하면 Claude에게 "경쟁사 소재 추천 돌려줘"라고 하면 돼요.</div>`; wire(); return; }
  const cur = list.find((r) => r.day === MK.cday) ?? list[0]; MK.cday = cur.day;
  const d = cur.data ?? {}, ideas = d.ideas ?? [], warns = d.warnings ?? [];
  const copyText = (i) => [`기본 문구:\n${i.copy?.body ?? ""}`, `제목: ${i.copy?.headline ?? ""}`, `설명: ${i.copy?.description ?? ""}`, `CTA: ${i.copy?.cta ?? ""}`].join("\n\n");
  const targetText = (i) => Object.entries(i.target ?? {}).map(([k, v]) => `${{ objective: "목표", age: "연령", gender: "성별", location: "위치", interests: "관심사", placements: "게재위치", budget: "일 예산", audience: "오디언스", note: "메모" }[k] ?? k}: ${Array.isArray(v) ? v.join(", ") : v}`).join("\n");
  const card = (i, idx) => {
    const w = warns.filter((x) => x.idea === idx);
    return `<div class="card idea"><div class="mkbar"><h3>${idx + 1}. ${esc(i.title)}</h3>${i.team ? `<span class="tag">${esc(i.team)}</span>` : ""}${i.format ? `<span class="tag">${esc(i.format)}</span>` : ""}</div>
      ${w.map((x) => `<div class="mut ${x.level === "warn" ? "warnline" : ""}">${x.level === "warn" ? "⚠️" : "ℹ️"} ${esc(x.msg)}${x.library_id ? ` <a href="${esc(MKCCORE.libraryUrl(x.library_id))}" target="_blank" rel="noopener">원본</a>` : ""}</div>`).join("")}
      <p><b>왜</b> ${esc(i.why ?? "")}</p>
      ${i.hook ? `<p><b>첫 3초</b> ${esc(i.hook)}</p>` : ""}
      <div class="copybox"><div class="mkbar"><b>카피</b><button class="sm" data-copy="${idx}">카피 복사</button></div><pre>${esc(copyText(i))}</pre></div>
      <div class="copybox"><div class="mkbar"><b>타겟 (광고관리자에 그대로)</b><button class="sm" data-target="${idx}">타겟 복사</button></div><pre>${esc(targetText(i))}</pre></div>
      ${i.production ? `<p class="mut">🎬 ${esc(i.production)}</p>` : ""}
      ${(i.refs ?? []).length ? `<p class="mut">참고한 경쟁사 광고: ${i.refs.map((r) => `<a href="${esc(MKCCORE.libraryUrl(String(r.library_id ?? r)))}" target="_blank" rel="noopener">${esc(r.page_name ?? r.library_id ?? r)}</a>`).join(" · ")}</p>` : ""}
      ${(i.ours ?? []).length ? `<p class="mut">우리 근거: ${i.ours.map(esc).join(" · ")}</p>` : ""}</div>`;
  };
  $m("#mkBody").innerHTML = head + `<div class="mkbar"><select id="mkDay">${list.map((r) => `<option value="${r.day}" ${r.day === cur.day ? "selected" : ""}>${esc(r.day)} 주</option>`).join("")}</select><span class="mut">갱신 ${esc(new Date(cur.updated_at).toLocaleString("ko-KR"))}</span></div>`
    + (d.notes?.summary ? `<div class="card"><b>이번 주 한 줄</b><p>${esc(d.notes.summary)}</p>${d.notes.caution ? `<p class="mut">${esc(d.notes.caution)}</p>` : ""}</div>` : "")
    + `<p class="mut">광고 집행은 대표님이 광고관리자에서 직접 해요. 카피는 팔로 이름으로, 경쟁사 문구는 구조만 참고했어요(베끼기 경고는 카드 위에 떠요).</p>`
    + ideas.map(card).join("");
  wire();
  $m("#mkDay").addEventListener("change", (e) => { MK.cday = e.target.value; MK.load(); });
  // 클립보드 API 가 막힌 환경(앱 안 브라우저 등)은 임시 textarea + execCommand 로 한 번 더 시도
  const copy = async (text) => {
    try { await navigator.clipboard.writeText(text); return toast("복사했어요"); } catch {}
    try { const ta = document.createElement("textarea"); ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0"; document.body.appendChild(ta); ta.select(); const ok = document.execCommand("copy"); ta.remove(); if (ok) return toast("복사했어요"); } catch {}
    toast("복사가 안 돼요 — 글을 길게 눌러 직접 복사해 주세요");
  };
  $m("#mkBody").querySelectorAll("button[data-copy]").forEach((b) => b.addEventListener("click", () => copy(copyText(ideas[+b.dataset.copy]))));
  $m("#mkBody").querySelectorAll("button[data-target]").forEach((b) => b.addEventListener("click", () => copy(targetText(ideas[+b.dataset.target]))));
}

// ── CSV 올리기 (대표) ──
// 광고는 계정 하나를 4개 지점이 같이 써서, 행마다 mk-core 가 캠페인 이름으로 판별한 team_key 를 지점 id 로 바꾼다.
// 게시물(오가닉)은 지점 인스타·페북 계정별 파일이라 위에서 고른 지점으로 올린다.
const teamIdOf = (key) => teams.find((t) => MKCORE.teamKeyOfTeamName(t.name) === key)?.id ?? null;
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
  $m("#mkBody").innerHTML = `<div class="card"><b>광고 데이터는 자동이에요</b>
      <p class="mut">매주 월요일 아침 메타 API로 광고 일별·연령+성별 데이터를 자동으로 받아 와요. 아래 CSV 올리기는 필요할 때만 쓰세요.</p></div>
    <div class="card"><b>CSV 올리기 (선택)</b>
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
// ── 🤖 에이전트 (mka_items: 대표는 전부+승인·킬스위치, 매니저는 자기 지점 것만 읽기 — 서버 RLS 가 거름) ──
// 맥북 에이전트(ad-agent/)가 DB 함수 mka_push 로 올린다(push_to_planner.py). 여기서는 보기 + 광고 제안 승인/반려 + 킬스위치만. 광고 설정 변경은 승인 번호를 받은 Claude가 한다.
const AST = { proposed: "🟡 승인 대기", approved: "✅ 승인", rejected: "⚫ 반려" };
const BR = MKACORE.BRANCH;
async function renderAgent(admin) {
  const [ir, cr, onr] = await Promise.all([
    sb.from("mka_items").select("kind, key, data, status, updated_at").order("updated_at", { ascending: false }).limit(300),
    sb.from("mkc_ads").select("library_id, grp, page_name, competitor_id, headline, body, start_date, media_type, n_ads").eq("active", true).not("start_date", "is", null).lte("start_date", new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10)).order("start_date", { ascending: true }).limit(1000),
    sb.from("mkc_competitors").select("id").eq("status", "on"),
  ]);
  if (fail(ir.error) || fail(cr.error) || fail(onr.error)) return;
  const rows = ir.data ?? [], today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  const kill = rows.some((r) => r.kind === "control" && r.key === "kill" && r.status === "on");
  const top = MKACORE.freshTop(rows);
  const props = rows.filter((r) => r.kind === "proposal").sort((a, b) => (a.status === "proposed" ? 0 : 1) - (b.status === "proposed" ? 0 : 1) || b.key.localeCompare(a.key));
  const threads = rows.filter((r) => r.kind === "thread");
  const posted = threads.filter((r) => r.status === "posted").sort((a, b) => String(b.data?.posted_at).localeCompare(String(a.data?.posted_at))).slice(0, 8);
  const ready = threads.filter((r) => r.status === "ready");
  const link = (u, t) => (MKACORE.safeUrl(u) ? `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(t)}</a>` : esc(t));
  const img = (src, cls) => (MKACORE.safeImg(src) ? `<img class="${cls}" src="${src}" alt="" loading="lazy">` : `<div class="${cls} agimg-no"></div>`);
  const age = rows.length ? Math.max(...rows.filter((r) => r.kind !== "control").map((r) => new Date(r.updated_at).getTime()), 0) : 0;
  const comp = MKACORE.pickCompetitorAds((cr.data ?? []).filter((a) => !MKCCORE.isOwnPage(a.page_name)), (onr.data ?? []).map((c) => c.id), today);

  const killCard = `<div class="card ${kill ? "warn" : ""}"><div class="mkbar"><b>${kill ? "🛑 에이전트 멈춤 (스레드 자동 게시 중단)" : "🟢 에이전트 켜짐"}</b>
    ${admin ? `<button class="btn" id="agKill" style="${kill ? "" : "background:#a3201a"}">${kill ? "다시 켜기" : "🛑 전부 멈추기"}</button>` : ""}</div>
    <p class="mut">${admin ? `누르면 다음 스레드 게시 직전에 바로 멈춰요. 급하면 Claude에게 "에이전트 멈춰"라고 해도 돼요.` : "대표님이 켜고 끄는 스위치예요. 아래는 우리 지점 것만 보여요."}${age ? ` 마지막 동기화 ${esc(new Date(age).toLocaleString("ko-KR"))}` : " 아직 동기화 기록이 없어요."}</p></div>`;

  const topHtml = top.length ? `<div class="tw"><table><tr><th>광고</th><th>최근 30일 리드</th><th>리드당</th><th>지출</th><th>상태</th></tr>${top.map((r) => { const d = r.data ?? {}; return `<tr><td><div class="agrow">${img(d.image, "agthumb")}${link(d.link, d.name)}</div></td><td>${n(d.leads)}</td><td>${usd(d.cpl)}</td><td>${usd(d.spend)}</td><td class="mut">${esc(d.status ?? "")}</td></tr>`; }).join("")}</table></div><p class="mut">이름을 누르면 광고 미리보기가 열려요. 리드 기준이고, 노출 1,000 미만은 뺐어요.</p>` : `<div class="mut">아직 없어요. 에이전트 동기화가 돌면 채워져요.</div>`;

  const propHtml = props.length ? props.map((r) => { const d = r.data ?? {}; return `<div class="cmp">${img(d.image, "agprop")}<div class="cmp-b"><div><b>${esc(BR[d.branch] ?? d.branch ?? "")}</b> <span class="tag">${AST[r.status] ?? esc(r.status)}</span> <span class="mut">#${esc(r.key)}</span></div>
      <div><b>${esc(d.angle ?? "")}</b></div><div>${esc(d.hook ?? "")}</div><div class="mut">제목: ${esc(d.headline ?? "")}${d.replaces_ad_name ? ` · 교체 대상: ${esc(d.replaces_ad_name)}` : ""}</div>
      <div class="mut">${esc(d.experiment ?? "")}</div>
      ${(d.trend_refs ?? []).length ? `<div class="mut">📈 참고한 트렌드 광고(업종 밖): ${d.trend_refs.map((t) => `${link(MKCCORE.libraryUrl(t.library_id), t.page_name || "광고")}${t.why ? ` — ${esc(t.why)}` : ""}`).join(" · ")}</div>` : ""}
      ${admin && r.status === "proposed" ? `<div class="mkbar"><button class="btn" data-ap="${esc(r.key)}" data-st="approved">승인</button><button class="btn" data-ap="${esc(r.key)}" data-st="rejected" style="background:var(--sub)">반려</button></div>` : ""}</div></div>`; }).join("") : `<div class="mut">대기 중인 제안이 없어요.</div>`;

  const compHtml = comp.length ? comp.map((a) => `<div class="cmp"><div class="cmp-b"><div>${link(MKCCORE.libraryUrl(a.library_id), a.page_name)} ${a.on ? `<span class="tag">켜진 경쟁사</span> ` : ""}<span class="mut">${n(a.days)}일째${n(a.n_ads) > 1 ? ` · 광고 ${n(a.n_ads)}개로 돌림` : ""} · ${esc(a.media_type || "?")} · ${a.grp === "en" ? "영어" : "일본어·중국어"}</span></div>
      <div>${esc(MKACORE.adText(a).slice(0, 90))}</div></div></div>`).join("") : `<div class="mut">조건에 맞는 경쟁사 광고가 아직 없어요.</div>`;

  const postedHtml = posted.length ? posted.map((r) => { const d = r.data ?? {}; return `<div class="cmp"><div class="cmp-b"><div>${link(d.permalink, String(d.text ?? "").split("\n")[0].slice(0, 60))} <span class="mut">${esc(BR[d.branch] ?? d.branch ?? "")} · ${esc(String(d.posted_at ?? "").slice(0, 16).replace("T", " "))}</span></div></div></div>`; }).join("") : `<div class="mut">아직 올라간 글이 없어요.</div>`;
  const readyHtml = ready.length ? ready.map((r) => { const d = r.data ?? {}; return `<div class="cmp"><div class="cmp-b"><div class="mut">${esc(BR[d.branch] ?? d.branch ?? "")} · ${esc(d.angle ?? "")}</div><div>${esc(String(d.text ?? "").slice(0, 120))}…</div></div></div>`; }).join("") : `<div class="mut">대기 중인 글이 없어요.</div>`;

  $m("#mkBody").innerHTML = killCard
    + `<div class="card"><b>🔥 조회·반응 좋은 우리 광고 TOP</b>${topHtml}</div>`
    + `<div class="card"><b>📣 추천 광고 — 에이전트 제안${admin ? " (승인하면 Claude가 광고관리자에 만들어요)" : ""}</b>${propHtml}</div>`
    + `<div class="card"><b>🔭 추천 광고 — 경쟁사에서 오래 도는 소재 (눌러서 광고 라이브러리 원문)</b><p class="mut">기준: 한국어 문구가 있는 광고 · 30일 넘게 도는 것만 · 페이지당 1개 · 켜 둔 경쟁사 → 여러 광고로 돌리는 소재 → 오래 도는 순</p>${compHtml}<p class="mut">오래 돌수록 성과가 났을 가능성이 높아요. 문구는 베끼지 말고 구조만 참고해요.</p></div>`
    + `<div class="card"><b>🧵 스레드 — 올라간 글</b>${postedHtml}</div><div class="card"><b>🧵 스레드 — 대기 ${ready.length}</b>${readyHtml}</div>`;
  $m("#agKill")?.addEventListener("click", async () => {
    const { error } = await sb.from("mka_items").update({ status: kill ? "off" : "on", updated_at: new Date().toISOString() }).eq("kind", "control").eq("key", "kill");
    if (fail(error)) return; toast(kill ? "다시 켰어요" : "멈춤 표시를 남겼어요"); renderAgent(admin);
  });
  V().querySelectorAll("[data-ap]").forEach((b) => b.addEventListener("click", async () => {
    const { error } = await sb.from("mka_items").update({ status: b.dataset.st, updated_at: new Date().toISOString() }).eq("kind", "proposal").eq("key", b.dataset.ap);
    if (fail(error)) return; toast(b.dataset.st === "approved" ? "승인했어요. Claude에게 \"승인된 광고 제안 진행해줘\"라고 하면 만들어요." : "반려했어요"); renderAgent(admin);
  }));
}
})();
