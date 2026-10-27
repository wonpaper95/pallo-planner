// 🧠 다음날 시뮬레이션 — 타임박스 플래너 (지점 공용, 하루 하나): 우선순위 3 · 브레인 덤프 · 시간표 5시~12시(한 시간 한 칸, 키 "HH:00")
// 적는 칸마다 실시간으로 나눔(비공개 채널 simnote:<지점>), 0.7초 뒤 저장. 같은 칸을 내가 적는 중이면 남의 글은 그 칸에만 안 덮음.
// data-tb = 지점 id (공용·실시간) 또는 "me" (🧠 시뮬레이터 탭 — 대표 개인, my_notes, 나만 봄). data-day 없으면 오늘
// index.html 의 sb·simChannel·today·md·pad·esc·fail·myName·W 를 씀 → window.TB
(() => {
const TB = (window.TB = {});
const HOURS = Array.from({ length: 20 }, (_, i) => i + 5); // 5 … 24(밤 12시)
const key = (h, m) => `${String(h).padStart(2, "0")}:${m}`;
const h12 = (h) => (h % 12 === 0 ? 12 : h % 12);
// 예전 :30 칸에 적은 건 그 시간 칸에 이어 붙여 보여 줌 (다음 저장 때 한 칸으로 합쳐짐)
// ✍️ 누가 적었는지 글자색으로 — 여러 줄 칸(브레인 덤프·시간표)은 줄마다, 우선순위 칸은 칸마다. 대표는 기본색
// plan.w = { 칸: ["줄1 쓴 사람", "줄2 쓴 사람", …] | "쓴 사람" }. 글은 투명 textarea 뒤 .tbbk 에 색 입혀 그림
const COLORS = { 민주: "#e64980", 올리비아: "#339af0", 준석: "#37b24d", 마야: "#e64980", 박혁: "#845ef7", 원빈: "#1098ad", 해민: "#f03e3e", 채림: "#74b816", 은서: "#cc5de8", 세연: "#4263eb", 헤이즐: "#b08968" }; // 마야 = 민주 (같은 사람, 핑크)
const EXTRA = ["#d6336c", "#0ca678", "#e67700", "#7950f2", "#1971c2", "#a61e4d"]; // 새 매니저: 이름으로 고정 배정
TB.color = (n) => !n || n === "대표" ? "" : COLORS[n] ?? EXTRA[[...n].reduce((a, c) => a + c.charCodeAt(0), 0) % EXTRA.length];
const wOf = (root) => (root._w ??= JSON.parse(root.dataset.w || "{}"));
const linesW = (a, n) => Array.from({ length: n }, (_, i) => (Array.isArray(a) ? a[i] ?? "" : a ?? "")); // 예전(칸 통째 이름)도 줄마다로
const bk = (v, a) => v.split("\n").map((l, i) => { const c = TB.color(linesW(a, i + 1)[i]); return `<span${c ? ` style="color:${c}"` : ""}>${esc(l)}</span>`; }).join("\n") + "\n";
// 바뀐 줄만 내 이름: 그대로 남은 줄은 원래 쓴 사람 유지
const relines = (prev, next, a, me) => {
  const old = prev.split("\n"), aa = linesW(a, old.length), pool = new Map();
  old.forEach((l, i) => { if (!pool.has(l)) pool.set(l, []); pool.get(l).push(aa[i]); });
  return next.split("\n").map((l) => (!l.trim() ? "" : pool.get(l)?.length ? pool.get(l).shift() : me));
};
const paint = (root) => {
  const w = wOf(root), names = [];
  root.querySelectorAll("[data-k]").forEach((el) => {
    const a = w[el.dataset.k];
    if (el.tagName === "TEXTAREA") { const b = el.previousElementSibling; if (b?.classList.contains("tbbk")) b.innerHTML = bk(el.value, a); el.value.split("\n").forEach((l, i) => l.trim() && names.push(linesW(a, i + 1)[i])); }
    else { el.style.color = TB.color(a); if (el.value.trim()) names.push(a); }
  });
  const leg = root.querySelector(".tbLeg");
  if (leg) leg.innerHTML = [...new Set(names)].filter((n) => n && n !== "대표").map((n) => `<span style="color:${TB.color(n)}">● ${esc(n)}</span>`).join("");
};
TB.paint = paint;
const hourText = (t, h) => [t[key(h, "00")], t[key(h, "30")]].filter((x) => x?.trim()).join("\n");

TB.html = (st, tid, day = "") => {
  const p = st?.plan?.p ?? [], t = st?.plan?.t ?? {};
  const w = st?.plan?.w ?? {}, sty = (k) => (TB.color(w[k]) && !Array.isArray(w[k]) ? ` style="color:${TB.color(w[k])}"` : "");
  const ta = (cls, k, v, extra = "") => `<div class="tbw ${cls === "tbc" ? "wc" : "wd"}"><div class="tbbk" aria-hidden="true">${bk(v, w[k])}</div><textarea class="${cls}" data-k="${k}"${extra}>${esc(v)}</textarea></div>`;
  return `<div class="tb" data-tb="${tid}" ${day ? `data-day="${day}"` : ""} data-w="${esc(JSON.stringify(w))}">
    <div class="tbL">
      <div class="tbLeg">${[...new Set(Object.values(w).flat())].filter((n) => n && n !== "대표").map((n) => `<span style="color:${TB.color(n)}">● ${esc(n)}</span>`).join("")}</div>
      <div class="tbPri"><div class="tbH">우선순위 3가지</div>${[0, 1, 2].map((i) => `<label><b>${i + 1}.</b><input data-k="p${i}"${sty(`p${i}`)} value="${esc(p[i] ?? "")}" placeholder="가장 중요한 일"></label>`).join("")}</div>
      <div class="tbDH">브레인 덤프 — 옮겨 적기</div>
      ${ta("tbDump", "body", st?.body ?? "", ` placeholder="떠오르는 걸 다 적고, 시간표로 옮겨 적어요"`)}
    </div>
    <div class="tbR"><table><tr><th>시간</th><th>할 일</th></tr>${HOURS.map((h) => `<tr class="${h >= 12 && h < 24 ? "pm" : ""}"><td class="h">${h12(h)}</td>`
      + `<td>${ta("tbc", `t${key(h, "00")}`, hourText(t, h), ` rows="1"`)}</td></tr>`).join("")}</table></div>
  </div>`;
};
// 칸들 → 저장할 모양
TB.read = (root) => {
  const v = (k) => root.querySelector(`[data-k="${k}"]`)?.value ?? "", t = {};
  root.querySelectorAll('[data-k^="t"]').forEach((el) => { if (el.value.trim()) t[el.dataset.k.slice(1)] = el.value; });
  return { body: v("body"), plan: { p: [0, 1, 2].map((i) => v(`p${i}`)), t, w: Object.fromEntries(Object.entries(wOf(root)).filter(([k, a]) => v(k).trim() && (!Array.isArray(a) || a.some(Boolean)))) } }; // 빈 칸은 이름 안 남김
};
// 받은 걸 칸에 — 지금 내가 적는 칸만 빼고
TB.apply = (root, st) => {
  const want = { body: st.body ?? "" };
  (st.plan?.p ?? []).forEach((x, i) => (want[`p${i}`] = x ?? ""));
  root.querySelectorAll('[data-k^="t"]').forEach((el) => (want[el.dataset.k] = hourText(st.plan?.t ?? {}, +el.dataset.k.slice(1, 3))));
  if (!st.plan) Object.keys(want).forEach((k) => k !== "body" && delete want[k]); // 예전 화면은 글(body)만 보냄
  if (st.plan?.w) { const w = wOf(root), mine = document.activeElement?.closest?.(".tb") === root ? document.activeElement.dataset.k : null; root._w = { ...st.plan.w, ...(mine && w[mine] ? { [mine]: w[mine] } : {}) }; paint(root); }
  for (const [k, v] of Object.entries(want)) { const el = root.querySelector(`[data-k="${k}"]`); if (el && el !== document.activeElement && el.value !== v) { el.value = v; if (el.matches(".tbc")) fit(el); } }
  paint(root);
  TB.grow(root);
};
// 글이 길면 칸이 아래로 늘어나서 다 보임 (브레인 덤프·시간표 칸)
const fit = (el) => { el.style.height = "auto"; el.style.height = (el.classList.contains("tbDump") ? Math.max(160, el.scrollHeight + 2) : el.scrollHeight) + "px"; };
TB.grow = (root) => root?.querySelectorAll(".tbDump, .tbc").forEach(fit);
// 남이 적은 것 → 그 지점 타임박스 전부(메인 칸·현황 카드)
TB.remote = (tid, p) => {
  const st = p.state ?? { body: p.body };
  document.querySelectorAll(`.tb[data-tb="${tid}"]`).forEach((root) => {
    if ((root.dataset.day || today()) !== p.day) { // 다른 날(오늘↔내일) 칸에 적는 중: 내가 안 적고 있으면 그 날로 바꿔 보여 줌
      if (p.day && !root._dirty && !root.contains(document.activeElement) && [today(), W.add(today(), 1)].includes(p.day)) window.simOnOtherDay?.(tid, p.day, root);
      return;
    }
    TB.apply(root, st);
    const who = root.closest("details")?.querySelector("summary small:last-of-type"); if (!who) return;
    who.textContent = `✍️ ${p.who} 적는 중…`; clearTimeout(who._t);
    who._t = setTimeout(() => { const n = new Date(); who.textContent = `${md(p.day)} · ${p.who} ${pad(n.getHours())}:${pad(n.getMinutes())} 저장`; }, 2500);
  });
};
// 내가 적으면: 0.15초 모아 실시간 전송 · 0.7초 뒤 저장 (다른 열린 타임박스에도 바로 반영)
const timers = new Map();
document.addEventListener("input", (e) => {
  const el = e.target.closest?.(".tb [data-k]"); if (!el) return;
  const root = el.closest(".tb"), mine = root.dataset.tb === "me", tid = mine ? "me" : +root.dataset.tb, day = root.dataset.day || today();
  const who = mine ? document.getElementById("mySimWho") : root.closest("details")?.querySelector("summary small:last-of-type");
  if (el.matches(".tbDump, .tbc")) fit(el);
  if (!mine) { const w = wOf(root), k = el.dataset.k; w[k] = el.tagName === "TEXTAREA" ? relines(el.previousElementSibling?.textContent.replace(/\n$/, "") ?? "", el.value, w[k], myName) : myName; paint(root); } // 직전 글 = 뒤에 그려 둔 글 // ✍️ 내가 바꾼 줄만 내 색
  if (who) who.textContent = "적는 중…";
  root._dirty = true; // 저장 전엔 서버 글로 안 덮음 (TB.sync)
  const tm = timers.get(tid) ?? {}; timers.set(tid, tm);
  if (!mine) clearTimeout(tm.send); if (!mine) tm.send = setTimeout(() => {
    const st = TB.read(root);
    document.querySelectorAll(`.tb[data-tb="${tid}"]`).forEach((r) => r !== root && (r.dataset.day || today()) === day && TB.apply(r, st));
    simChannel(tid, (p) => TB.remote(tid, p), "tb").send({ type: "broadcast", event: "text", payload: { day, state: st, body: st.body, who: myName } });
  }, 150);
  clearTimeout(tm.save); tm.save = setTimeout(async () => {
    const st = TB.read(root);
    const { error } = mine ? await sb.from("my_notes").upsert({ day, body: st.body, plan: st.plan, updated_at: new Date().toISOString() })
      : await sb.rpc("team_note_set", { p_day: day, p_body: st.body, p_team: tid, p_plan: st.plan }); root._dirty = false; if (fail(error)) return;
    const n = new Date(); if (who) who.textContent = `${md(day)} · ${pad(n.getHours())}:${pad(n.getMinutes())} 저장됨`;
  }, 700);
});
// 🧠 시뮬레이터 탭 (대표 개인): 날짜 ‹ 오늘 › · 하루 하나
TB.myDay = null;
TB.loadMine = async (day) => {
  const v = document.getElementById("mySimView"); if (!v) return;
  TB.myDay = day ?? TB.myDay ?? today();
  const d = TB.myDay, DOWS = "일월화수목금토", wd = DOWS[W.parse(d).getDay()];
  const [{ data, error }, tk] = await Promise.all([sb.from("my_notes").select("body, plan, updated_at").eq("day", d).maybeSingle(),
    sb.from("tasks").select("id, title, done, start_time, estimate_min, important, sort").eq("user_id", me.id).eq("day", d).neq("title", "")]); // 📋 그날 주간 할 일
  if (fail(error || tk.error)) return;
  const todos = (tk.data ?? []).sort(W.daySort);
  v.innerHTML = `<div class="mysimbar"><h2>🧠 시뮬레이터 <small>내 타임박스 · 나만 봐요</small></h2>
      <span class="mysimnav"><button data-myd="-1">‹</button><b>${md(d)}(${wd})${d === today() ? " · 오늘" : ""}</b><button data-myd="1">›</button>${d !== today() ? `<button data-myd="0">오늘</button>` : ""}<button data-myrec>📜 기록</button></span>
      <small id="mySimWho">${data?.updated_at ? `${md(d)} · ${pad(new Date(data.updated_at).getHours())}:${pad(new Date(data.updated_at).getMinutes())} 저장` : "아직 없음"}</small></div>
    <div class="mytodo"><h3>📋 ${md(d)} 할 일 <small>주간 탭과 같은 목록 · ${todos.filter((x) => x.done).length}/${todos.length} · 체크하면 주간에도 반영</small></h3>
      ${todos.length ? `<ul>${todos.map((x) => `<li class="${x.done ? "done" : ""}"><input type="checkbox" data-mytodo="${x.id}" ${x.done ? "checked" : ""}><span class="t">${x.important ? "★ " : ""}${esc(x.title)}</span>${x.start_time ? `<span class="m">🕐 ${x.start_time.slice(0, 5)}</span>` : ""}${x.estimate_min ? `<span class="m">⏳ ${x.estimate_min}분</span>` : ""}</li>`).join("")}</ul>` : `<div class="mut" style="color:var(--sub);font-size:14px">이날 할 일이 없어요</div>`}</div>
    <div class="mysimcard">${TB.html({ body: data?.body, plan: data?.plan }, "me", d)}</div>`;
  TB.grow(v.querySelector(".tb"));
};
document.addEventListener("change", async (e) => { // 📋 할 일 체크 → 주간과 같은 tasks
  const c = e.target.closest?.("#mySimView [data-mytodo]"); if (!c) return;
  const { error } = await sb.from("tasks").update({ done: c.checked }).eq("id", +c.dataset.mytodo); if (fail(error)) { c.checked = !c.checked; return; }
  TB.loadMine(); window.loadAll?.();
});
document.addEventListener("click", (e) => {
  if (e.target.closest?.("#mySimView [data-myrec]")) return TB.history("me", "내 타임박스");
  const b = e.target.closest?.("#mySimView [data-myd]"); if (!b) return;
  const n = +b.dataset.myd; TB.loadMine(n ? W.add(TB.myDay, n) : today());
});
document.addEventListener("scroll", (e) => { const el = e.target; if (el?.matches?.(".tbw > textarea")) el.previousElementSibling.scrollTop = el.scrollTop; }, true); // 칸을 줄여 스크롤해도 색 글자가 같이 움직임
// 🔁 실시간 보조: 오래 켜 둔 화면·잠자기 뒤에 실시간 연결이 끊겨도 10초마다(+화면 돌아올 때) 서버 글을 다시 받아 맞춤.
// 적는 중인 칸은 안 덮음(TB.apply). 끊긴 실시간 채널은 다시 연결
let polling = false;
TB.sync = async () => {
  if (polling || document.hidden || typeof sb === "undefined") return; polling = true;
  try {
    for (const [topic, ent] of simChs ?? []) if (["closed", "errored"].includes(ent.ch.state)) { sb.removeChannel(ent.ch); simChs.delete(topic); ent.cbs.forEach((c, k) => simChannel(+topic.split(":")[1], c, k)); }
    for (const root of document.querySelectorAll(".tb[data-tb]")) {
      const tid = +root.dataset.tb; if (!tid || !root.offsetParent || root._dirty) continue; // 지점 타임박스 중 보이는 것만 (개인·기록 제외)
      const day = root.dataset.day || today(), { data } = await sb.rpc("team_note_get", { p_day: day, p_team: tid }), n = data?.[0];
      if (!n?.at || n.at === root._at) continue; root._at = n.at;
      TB.apply(root, { body: n.body ?? "", plan: n.plan ?? {} });
    }
  } finally { polling = false; }
};
setInterval(TB.sync, 10000);
document.addEventListener("visibilitychange", () => !document.hidden && TB.sync());
window.addEventListener("focus", () => TB.sync());
// 📜 기록: 지난 날 타임박스 목록 → 눌러서 그날 그대로 보기 (읽기만, 쓴 사람 색 그대로). tid = 지점 id 또는 "me"(대표 개인)
const DOWS = "일월화수목금토";
const filled = (r) => (r.body ?? "").trim() || (r.plan?.p ?? []).some((x) => x?.trim()) || Object.values(r.plan?.t ?? {}).some((x) => x?.trim());
TB.history = async (tid, title = "") => {
  const { data, error } = tid === "me" ? await sb.from("my_notes").select("day, body, plan, at:updated_at").order("day", { ascending: false }).limit(90)
    : await sb.rpc("team_note_days", { p_team: tid }); if (fail(error)) return;
  const rows = (data ?? []).filter(filled);
  let d = document.getElementById("simRecDlg"); if (!d) { d = document.createElement("dialog"); d.id = "simRecDlg"; d.className = "wide"; document.body.appendChild(d); }
  const names = (r) => [...new Set(Object.values(r.plan?.w ?? {}).flat())].filter((n) => n && n !== "대표");
  const show = (i) => {
    const r = rows[i], v = d.querySelector(".srView"); d.querySelectorAll(".srList button").forEach((b) => b.classList.toggle("on", +b.dataset.sr === i));
    v.innerHTML = `<div class="srHead"><b>${md(r.day)}(${DOWS[W.parse(r.day).getDay()]})</b> <small class="mut">${r.who ? `${esc(r.who)} · ` : ""}${r.at ? `${md(r.at.slice(0, 10))} ${pad(new Date(r.at).getHours())}:${pad(new Date(r.at).getMinutes())} 마지막 저장` : ""}</small></div>${TB.html({ body: r.body, plan: r.plan }, "rec", r.day)}`;
    v.querySelectorAll("[data-k]").forEach((el) => (el.readOnly = true)); TB.grow(v.querySelector(".tb"));
  };
  d.innerHTML = `<div class="srTop"><h3 style="margin:0">📜 시뮬레이션 기록${title ? ` · ${esc(title)}` : ""}</h3><button class="btn ghost" data-srx>닫기</button></div>
    ${rows.length ? `<div class="srBody"><div class="srList">${rows.map((r, i) => `<button data-sr="${i}"><b>${md(r.day)}(${DOWS[W.parse(r.day).getDay()]})</b><small>${names(r).map((n) => `<span style="color:${TB.color(n)}">●${esc(n)}</span>`).join(" ") || esc(r.who ?? "")}</small><small class="mut">${esc((r.plan?.p ?? []).find((x) => x?.trim()) ?? (r.body ?? "").split("\n")[0]).slice(0, 40)}</small></button>`).join("")}</div><div class="srView"></div></div>`
      : `<p class="mut">아직 기록이 없어요. 타임박스에 적으면 날짜별로 여기 쌓여요.</p>`}`;
  d.onclick = (e) => { if (e.target.closest("[data-srx]")) return d.close(); const b = e.target.closest("[data-sr]"); if (b) show(+b.dataset.sr); };
  d.showModal(); if (rows.length) show(0);
};
// 칸에서 Enter = 아래 칸으로 (시간표 빨리 채우기), Shift+Enter = 칸 안에서 줄바꿈
document.addEventListener("keydown", (e) => {
  const el = e.target.closest?.(".tb input[data-k], .tb .tbc"); if (!el || e.key !== "Enter" || e.shiftKey || e.isComposing) return; // Shift+Enter = 칸 안 줄바꿈
  e.preventDefault(); const all = [...el.closest(".tb").querySelectorAll("input[data-k], .tbc")], i = all.indexOf(el);
  const col = el.closest("td"), tr = el.closest("tr"); // 시간표: 같은 열 아래 줄
  const next = col && tr?.nextElementSibling ? tr.nextElementSibling.children[col.cellIndex]?.querySelector(".tbc") : all[i + 1];
  next?.focus();
});
})();
