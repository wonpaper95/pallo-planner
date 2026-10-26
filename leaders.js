// 🧑‍🏫 리더 현황 보드 탭: 지점별 리더 명단 · 라포 ⭐ · 수업마다 출석(O/X 클릭) · 🚨 재관리(한 달 3번↑ 결석) · 🏆 개근 혜택
// 주간 / 월간 / 3달 보기. 계산은 leaders-core.js(LDC), index.html 의 sb·isBoss·previewTeam·previewUser·teams·myName·esc·toast·fail 을 씀 → window.LD
(() => {
const LD = (window.LD = { team: null, mode: "week", anchor: null, rows: [], att: new Map(), subs: new Map(), cover: new Map(), awards: new Map() });
const V = () => document.getElementById("ldView");
const DOW = "일월화수목금토", md = (d) => `${+d.slice(5, 7)}/${+d.slice(8, 10)}`, dw = (d) => DOW[W.parse(d).getDay()];
const today = () => W.ymd(new Date());
const admin = () => isBoss && !previewTeam && !previewUser;
const ym = (m) => `${+m.slice(5, 7)}월`;
try { LD.mode = localStorage.getItem("ld-mode") || "week"; } catch {}

// 보는 기간: 주간 = 그 주 월~일, 월간 = 그달, 3달 = 기준 달 포함 지난 3달
function range() {
  const a = LD.anchor;
  if (LD.mode === "week") { const m = W.monday(a); return [m, W.add(m, 6)]; }
  if (LD.mode === "month") return [LDC.monthStart(a), LDC.monthEnd(a)];
  return [LDC.addMonths(a, -2), LDC.monthEnd(a)];
}
const statMonth = () => LDC.monthStart(LD.mode === "week" ? W.add(W.monday(LD.anchor), 3) : LD.anchor); // 주간은 그 주 목요일이 속한 달

LD.load = async function () {
  LD.anchor ??= today();
  if (admin() && !teams.length) teams = (await sb.from("teams").select("*").order("sort")).data ?? []; // 앱 켜자마자 이 탭이면 지점 목록이 아직 없을 수 있음
  if (admin() && !LD.team) { // 대표: 마지막에 본 지점, 처음이면 리더가 있는 첫 지점
    let saved = null; try { saved = +localStorage.getItem("ld-team") || null; } catch {}
    const has = new Set(((await sb.from("leaders").select("team_id").limit(2000)).data ?? []).map((x) => x.team_id));
    LD.team = teams.find((t) => t.id === saved)?.id ?? teams.find((t) => has.has(t.id))?.id ?? teams[0]?.id ?? null;
  }
  if (!admin()) LD.team = previewTeam ?? (await sb.rpc("my_team")).data ?? null; // 매니저·미리보기: 우리 지점
  if (!LD.team) { V().innerHTML = `<div class="ldbar"><h2>🧑‍🏫 리더 현황 보드</h2></div><div class="card mut">지점이 정해져야 볼 수 있어요 — 대표님께 말씀해 주세요</div>`; return; }
  const [from, to] = range(), aFrom = [from, LDC.addMonths(statMonth(), -2)].sort()[0], aTo = [to, LDC.monthEnd(statMonth())].sort().at(-1);
  const { data: rows, error } = await sb.from("leaders").select("*").eq("team_id", LD.team).order("sort").order("id");
  if (fail(error)) return;
  const ids = rows.map((r) => r.id);
  const [a, w] = ids.length ? await Promise.all([sb.from("leader_att").select("leader_id, day, state, sub").in("leader_id", ids).gte("day", aFrom).lte("day", aTo),
    sb.from("leader_awards").select("*").in("leader_id", ids)]) : [{ data: [] }, { data: [] }];
  if (fail(a.error || w.error)) return;
  LD.rows = rows; LD.att = new Map(rows.map((r) => [r.id, new Map()]));
  LD.subs = new Map(rows.map((r) => [r.id, new Map()])); LD.cover = new Map();
  a.data.forEach((x) => { LD.att.get(x.leader_id)?.set(x.day, x.state); if (!x.sub) return;
    LD.subs.get(x.leader_id)?.set(x.day, x.sub);
    const who = LDC.matchSub(x.sub, rows); if (!who) return; // 🔁 대타 해준 사람 → 그달 출석 인정 +1
    const m = LDC.monthStart(x.day), c = LD.cover.get(who.id) ?? new Map(); c.set(m, (c.get(m) ?? 0) + 1); LD.cover.set(who.id, c); });
  LD.awards = new Map(w.data.map((x) => [`${x.leader_id}:${x.month}`, x]));
  LD.render();
};

const stars = (r) => `<span class="ldstars r${r.rapport ? (r.rapport <= 2 ? "low" : r.rapport === 3 ? "mid" : "high") : "none"}" title="라포 ${r.rapport ?? "-"}/5${r.rapport_by ? ` · ${esc(r.rapport_by)}` : ""}">`
  + [1, 2, 3, 4, 5].map((i) => `<button data-star="${i}">${i <= (r.rapport ?? 0) ? "★" : "☆"}</button>`).join("") + `</span>`;
const cov = (r, m) => LD.cover.get(r.id)?.get(m) ?? 0;
const stat = (r, m) => LDC.monthStat(r.grp, m, LD.att.get(r.id), today(), cov(r, m));
// 출석 버튼: 누르면 O → X → X+대타(이름) → 비움
const attBtn = (r, d, label = "") => { const s = LD.att.get(r.id)?.get(d) ?? "", sb_ = LD.subs.get(r.id)?.get(d) ?? "", fut = d > today();
  return `<button class="att ${s === "O" ? "o" : s === "X" ? "x" : ""} ${sb_ ? "sub" : ""} ${fut ? "fut" : ""}" data-att="${d}" title="${md(d)}(${dw(d)})${sb_ ? ` 대타 ${esc(sb_)}` : ""} · 누르면 O → X → 대타 → 비움">${label ? `<small>${label}</small>` : ""}${s || "·"}${sb_ ? `<i>${esc(sb_)}</i>` : ""}</button>`; };
const cell = (r, d) => `<td class="c">${attBtn(r, d)}</td>`;
function flags(r, m) {
  const st = stat(r, m), aw = LD.awards.get(`${r.id}:${m}`);
  return `<span class="ldfl">${st.recheck ? `<b class="re" title="${ym(m)} 결석 ${st.x} − 대타 ${st.cover}">🚨 재관리</b>` : st.x ? `<span class="mut">결석 ${st.x}</span>` : ""}`
    + `${st.cover ? `<span class="cv" title="${ym(m)} 다른 리더 대신 와준 횟수 — 출석으로 인정">🔁 대타 ${st.cover}</span>` : ""}`
    + `${st.award ? (aw ? `<button class="aw done" data-aw="${m}" title="${esc(aw.by_name)} · ${esc(aw.note)}">🎁 혜택 줌</button>` : `<button class="aw" data-aw="${m}">🏆 개근 · 혜택 주기</button>`)
      : st.onTrack ? `<span class="on" title="${ym(m)} 지금까지 다 나옴">🏆 개근 중</span>` : ""}</span>`;
}
function monthCell(r, m) {
  const st = stat(r, m);
  return `<td class="m">${st.o + st.x + st.cover ? `<span class="ldo">O ${st.o}</span> <span class="ldx">X ${st.x}</span>${st.blank ? ` <span class="mut">미체크 ${st.blank}</span>` : ""}` : `<span class="mut">–</span>`}<br>${flags(r, m)}</td>`;
}

LD.render = function () {
  const [from, to] = range(), sm = statMonth(), td = today();
  const months = [LDC.addMonths(LD.anchor, -2), LDC.addMonths(LD.anchor, -1), LDC.monthStart(LD.anchor)];
  const leaders = LD.rows.filter((r) => r.kind !== "staff"), staff = LD.rows.filter((r) => r.kind === "staff");
  const cnt = { need: LD.rows.filter((r) => r.status === "구해야 함").length, re: 0, aw: 0 };
  LD.rows.forEach((r) => { const s = stat(r, sm); if (s.recheck) cnt.re++; if (s.award || s.onTrack) cnt.aw++; });
  const title = LD.mode === "week" ? `${md(from)} ~ ${md(to)}` : LD.mode === "month" ? `${LD.anchor.slice(0, 4)}년 ${ym(LD.anchor)}` : `${ym(months[0])} ~ ${ym(months[2])}`;
  const blocks = [];
  for (const g of LDC.GRPS) {
    const slots = [...new Set(leaders.filter((r) => r.grp === g).map((r) => r.slot))].sort((a, b) => LDC.slotMin(a) - LDC.slotMin(b));
    for (const s of slots) {
      const rs = leaders.filter((r) => r.grp === g && r.slot === s), need = rs.filter((r) => r.status === "구해야 함").length;
      const ses = LD.mode === "q3" ? [] : LDC.sessions(g, from, to);
      const head = `<tr><th>레벨</th><th>자리</th><th>리더</th><th>라포</th><th>상태</th>${LD.mode === "q3" ? months.map((m) => `<th>${ym(m)}</th>`).join("")
        : ses.map((d) => `<th class="${d === td ? "td" : ""}">${md(d)}(${dw(d)})</th>`).join("") + `<th>${ym(sm)}</th>`}${LD.mode === "week" ? "<th>특이사항</th><th>리더교육</th>" : ""}<th></th></tr>`;
      const body = rs.map((r) => `<tr data-id="${r.id}" class="${r.status === "구해야 함" ? "need" : ""}"><td>${esc(r.level)}</td><td>${esc(r.seat)}</td>`
        + `<td class="nm"><b>${esc(r.name)}</b>${r.phone ? `<a href="tel:${r.phone.replace(/[^\d]/g, "").slice(0, 11)}">${esc(r.phone)}</a>` : ""}${r.start_day ? `<small class="mut">시작 ${esc(r.start_day)}</small>` : ""}</td>`
        + `<td>${stars(r)}</td><td><button class="st ${r.status === "구해야 함" ? "need" : "ok"}" data-st title="누르면 바뀜">${r.status === "구해야 함" ? "🔴 구해야 함" : "🟢 확정"}</button></td>`
        + (LD.mode === "q3" ? months.map((m) => monthCell(r, m)).join("") : ses.map((d) => cell(r, d)).join("") + `<td>${flags(r, sm)}</td>`)
        + (LD.mode === "week" ? `<td class="nt" title="${esc(r.note)}">${esc(r.note)}</td><td class="nt">${esc(r.edu)}</td>` : "")
        + `<td><button class="btn ghost lded" title="고치기">✏️</button></td></tr>`).join("");
      blocks.push(`<section class="ldblk"><h3>${g} ${esc(s || "시간 미정")} <span class="mut">${rs.length}팀</span>${need ? ` <span class="ldneed">🔴 리더 구해야 함 ${need}</span>` : ""}</h3><div class="ldtw"><table>${head}${body}</table></div></section>`);
    }
  }
  if (staff.length) { // 🧑‍💼 워킹스텝: 반이 저마다 달라서 출석은 한 칸에 날짜 버튼으로
    const head = `<tr><th>업무</th><th>이름</th><th>라포</th><th>상태</th>${LD.mode === "q3" ? months.map((m) => `<th>${ym(m)}</th>`).join("") : `<th>출석</th><th>${ym(sm)}</th>`}<th>비고</th><th></th></tr>`;
    const body = staff.map((r) => `<tr data-id="${r.id}" class="${r.status === "구해야 함" ? "need" : ""}"><td>${esc([r.grp, r.slot].filter(Boolean).join(" "))}</td>`
      + `<td class="nm"><b>${esc(r.name)}</b>${r.phone ? `<a href="tel:${r.phone.replace(/[^\d]/g, "").slice(0, 11)}">${esc(r.phone)}</a>` : ""}${r.start_day ? `<small class="mut">시작 ${esc(r.start_day)}</small>` : ""}</td>`
      + `<td>${stars(r)}</td><td><button class="st ${r.status === "구해야 함" ? "need" : "ok"}" data-st title="누르면 바뀜">${r.status === "구해야 함" ? "🔴 구해야 함" : "🟢 확정"}</button></td>`
      + (LD.mode === "q3" ? months.map((m) => monthCell(r, m)).join("")
        : `<td class="ina">${r.grp ? LDC.sessions(r.grp, from, to).map((d) => attBtn(r, d, `${md(d)}(${dw(d)})`)).join("") : `<span class="mut">–</span>`}</td><td>${flags(r, sm)}</td>`)
      + `<td class="nt" title="${esc(r.note)}">${esc(r.note)}</td><td><button class="btn ghost lded" title="고치기">✏️</button></td></tr>`).join("");
    blocks.push(`<section class="ldblk"><h3>🧑‍💼 워킹스텝 <span class="mut">${staff.length}명</span></h3><div class="ldtw"><table>${head}${body}</table></div></section>`);
  }
  V().innerHTML = `<div class="ldbar"><h2>🧑‍🏫 리더 현황 보드</h2>
      ${admin() ? `<select id="ldTeam">${teams.map((t) => `<option value="${t.id}" ${t.id === LD.team ? "selected" : ""}>${esc(t.name)}</option>`).join("")}</select>` : ""}
      <span class="ldseg">${[["week", "주간"], ["month", "월간"], ["q3", "3달"]].map(([k, l]) => `<button data-mode="${k}" class="${LD.mode === k ? "on" : ""}">${l}</button>`).join("")}</span>
      <span class="ldnav"><button data-nav="-1">‹</button><b>${title}</b><button data-nav="1">›</button><button data-nav="0">오늘</button></span>
      <span class="ldact"><button class="btn" id="ldAdd">+ 리더 추가</button><button class="btn ghost" id="ldPaste">📋 시트에서 붙여넣기</button></span></div>
    <div class="ldsum"><span>리더 <b>${leaders.length}</b>팀</span>${staff.length ? `<span>스텝 <b>${staff.length}</b>명</span>` : ""}<span class="ldneed">🔴 구해야 함 <b>${cnt.need}</b></span><span class="re">🚨 재관리 <b>${cnt.re}</b></span><span class="on">🏆 개근 <b>${cnt.aw}</b></span>
      <small class="mut">${ym(sm)} 기준 · 한 달에 ${LDC.ABSENT_LIMIT}번 이상 빠지면 🚨 재관리 · 그달 수업을 다 나오면 🏆 개근 → 혜택 · 🔁 다른 리더 대신 와준(대타) 날은 출석으로 인정 · 출석 칸은 누르면 O → X → 대타 → 비움 · ⭐ 1~2 빨강 · 3 주황 · 4~5 초록</small></div>
    ${blocks.join("") || `<div class="card mut" style="padding:16px">아직 리더가 없어요 — <b>+ 리더 추가</b> 하거나, 구글시트에서 줄을 복사해 <b>📋 시트에서 붙여넣기</b> 하세요</div>`}`;
};

// ── 고치기 · 붙여넣기 창 ──
function dlg(html) {
  let d = document.getElementById("ldDlg");
  if (!d) { d = document.createElement("dialog"); d.id = "ldDlg"; document.body.appendChild(d); }
  d.innerHTML = html; d.showModal(); return d;
}
const F = [["level", "레벨"], ["seat", "자리"], ["name", "리더 이름"], ["start_day", "시작일"], ["phone", "전화번호"], ["note", "특이사항 (상담조교 참고)"], ["edu", "리더교육 일정 · 참석"], ["memo", "메모"]];
function editDlg(r) {
  const d = dlg(`<form method="dialog" class="ldform"><h2>${r ? "리더 고치기" : "리더 추가"}</h2>
    <label>구분<select name="kind"><option value="leader" ${r?.kind !== "staff" ? "selected" : ""}>리더</option><option value="staff" ${r?.kind === "staff" ? "selected" : ""}>워킹스텝</option></select></label>
    <label>반<select name="grp">${LDC.GRPS.map((g) => `<option ${r?.grp === g ? "selected" : ""}>${g}</option>`).join("")}<option value="" ${r && !r.grp ? "selected" : ""}>없음 (블로그스텝 등)</option></select></label>
    <label>시간대 · 업무<input name="slot" placeholder="11AM · 6PM · 오전 · 블로그스텝" value="${esc(r?.slot ?? "")}" maxlength="20"></label>
    ${F.map(([k, l]) => `<label>${l}<input name="${k}" value="${esc(r?.[k] ?? "")}" ${k === "name" ? "required" : ""}></label>`).join("")}
    <label>상태<select name="status"><option ${r?.status !== "구해야 함" ? "selected" : ""}>확정</option><option ${r?.status === "구해야 함" ? "selected" : ""}>구해야 함</option></select></label>
    <div class="row">${r ? `<button type="button" class="btn ghost" id="ldDel">🗑 지우기</button>` : ""}<span style="flex:1"></span><button type="button" class="btn ghost" value="cancel" id="ldX">취소</button><button class="btn">저장</button></div></form>`);
  const f = d.querySelector("form");
  d.querySelector("#ldX").onclick = () => d.close();
  f.onsubmit = async (e) => {
    e.preventDefault();
    const v = Object.fromEntries(new FormData(f)); v.name = v.name.trim(); v.slot = /\d\s*(am|pm)/i.test(v.slot) ? v.slot.replace(/\s+/g, "").toUpperCase() : v.slot.trim();
    const { error } = r ? await sb.from("leaders").update(v).eq("id", r.id) : await sb.from("leaders").insert({ ...v, team_id: LD.team });
    if (fail(error)) return; d.close(); toast(r ? "고쳤어요" : "추가했어요"); LD.load();
  };
  d.querySelector("#ldDel")?.addEventListener("click", async () => {
    if (!confirm(`'${r.name}' 리더를 지울까요? 출석 기록도 같이 지워져요`)) return;
    const { error } = await sb.from("leaders").delete().eq("id", r.id); if (fail(error)) return; d.close(); LD.load();
  });
}
function pasteDlg() {
  const d = dlg(`<div class="ldform"><h2>📋 구글시트에서 붙여넣기</h2>
    <p class="mut" style="margin:0">리더 시트에서 <b>구역 제목 줄부터</b>(예: ☀️ 오전 | 월수 11AM …) 리더 줄까지 드래그해 복사(⌘C) → 아래에 붙여넣기(⌘V). 여러 구역을 한 번에 넣어도 돼요. 이름 끝 숫자(예: 김주란4+)는 라포 ⭐로 바뀌어요.</p>
    <textarea id="ldTxt" rows="10" placeholder="여기에 붙여넣기"></textarea><div id="ldPrev" class="mut"></div>
    <div class="row"><span style="flex:1"></span><button type="button" class="btn ghost" id="ldX">취소</button><button class="btn" id="ldGo" disabled>추가</button></div></div>`);
  const t = d.querySelector("#ldTxt"), go = d.querySelector("#ldGo");
  let rows = [];
  t.oninput = () => {
    rows = LDC.parsePaste(t.value); go.disabled = !rows.length; go.textContent = `${rows.length}명 추가`;
    const by = {}; rows.forEach((r) => { const k = `${r.grp} ${r.slot}`; by[k] = (by[k] ?? 0) + 1; });
    d.querySelector("#ldPrev").textContent = rows.length ? `읽은 리더: ${Object.entries(by).map(([k, n]) => `${k} ${n}명`).join(" · ")}` : t.value.trim() ? "리더 줄을 못 찾았어요 — 구역 제목(월수 11AM 같은) 줄부터 같이 복사해 주세요" : "";
  };
  d.querySelector("#ldX").onclick = () => d.close();
  go.onclick = async () => {
    const base = Date.now() / 1000, by = myName ?? "";
    const { error } = await sb.from("leaders").insert(rows.map(({ att, ...r }, i) => ({ ...r, team_id: LD.team, sort: base + i, rapport_by: r.rapport ? by : "" })));
    if (fail(error)) return; d.close(); toast(`${rows.length}명 추가했어요`); LD.load();
  };
}

document.addEventListener("click", async (e) => {
  const v = V(); if (!v || !v.contains(e.target)) return;
  const b = e.target.closest("button"); if (!b) return;
  if (b.dataset.mode) { LD.mode = b.dataset.mode; try { localStorage.setItem("ld-mode", LD.mode); } catch {} return LD.load(); }
  if (b.dataset.nav !== undefined) {
    const n = +b.dataset.nav;
    LD.anchor = !n ? today() : LD.mode === "week" ? W.add(LD.anchor, 7 * n) : LDC.addMonths(LD.anchor, n);
    return LD.load();
  }
  if (b.id === "ldAdd") return editDlg(null);
  if (b.id === "ldPaste") return pasteDlg();
  const tr = b.closest("tr[data-id]"), r = tr && LD.rows.find((x) => x.id == tr.dataset.id); if (!r) return;
  if (b.classList.contains("lded")) return editDlg(r);
  if (b.dataset.star) { const n = +b.dataset.star === r.rapport ? null : +b.dataset.star; // 같은 별 다시 누르면 지움
    const { error } = await sb.from("leaders").update({ rapport: n, rapport_by: n ? myName ?? "" : "" }).eq("id", r.id); if (fail(error)) return;
    Object.assign(r, { rapport: n, rapport_by: n ? myName ?? "" : "" }); return LD.render(); }
  if (b.dataset.st !== undefined) { const s = r.status === "구해야 함" ? "확정" : "구해야 함";
    const { error } = await sb.from("leaders").update({ status: s }).eq("id", r.id); if (fail(error)) return; r.status = s; return LD.render(); }
  if (b.dataset.att) { // O → X → X+대타 → 비움
    const d = b.dataset.att, m = LD.att.get(r.id), cur = m.get(d) ?? "", cs = LD.subs.get(r.id).get(d) ?? "";
    let nx = cur === "" ? "O" : cur === "O" ? "X" : "", sub = "";
    if (cur === "X" && !cs) { const v = prompt(`${md(d)}(${dw(d)}) ${r.name} 대신 누가 와줬나요? (대타 이름 — 그 리더는 출석으로 인정돼요)\n비우고 확인하면 기록을 지워요`, ""); if (v === null) return;
      if (v.trim()) { nx = "X"; sub = v.trim().slice(0, 40); } }
    const { error } = nx ? await sb.from("leader_att").upsert({ leader_id: r.id, day: d, state: nx, sub, by_name: myName ?? "", at: new Date().toISOString() })
      : await sb.from("leader_att").delete().eq("leader_id", r.id).eq("day", d);
    if (fail(error)) return; return LD.load(); // 대타 인정은 다른 리더 줄에도 반영돼서 다시 불러옴
  }
  if (b.dataset.aw) { const k = `${r.id}:${b.dataset.aw}`, aw = LD.awards.get(k);
    if (aw) { if (!confirm(`${ym(b.dataset.aw)} 개근 혜택 기록을 지울까요? (${aw.by_name} · ${aw.note || "메모 없음"})`)) return;
      const { error } = await sb.from("leader_awards").delete().eq("leader_id", r.id).eq("month", b.dataset.aw); if (fail(error)) return; LD.awards.delete(k); return LD.render(); }
    const note = prompt(`${r.name} 리더 ${ym(b.dataset.aw)} 개근 🏆 — 어떤 혜택을 줬나요? (예: 커피 쿠폰)`, ""); if (note === null) return;
    const row = { leader_id: r.id, month: b.dataset.aw, note: note.trim(), by_name: myName ?? "" };
    const { error } = await sb.from("leader_awards").insert(row); if (fail(error)) return; LD.awards.set(k, row); toast("🎁 혜택 기록했어요"); return LD.render();
  }
});
document.addEventListener("change", (e) => { if (e.target.id === "ldTeam") { LD.team = +e.target.value; try { localStorage.setItem("ld-team", LD.team); } catch {} LD.load(); } });
})();
