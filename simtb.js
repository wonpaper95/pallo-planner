// 🧠 다음날 시뮬레이션 — 타임박스 플래너 (지점 공용, 하루 하나): 우선순위 3 · 브레인 덤프 · 시간표 5시~12시(:00/:30)
// 적는 칸마다 실시간으로 나눔(비공개 채널 simnote:<지점>), 0.7초 뒤 저장. 같은 칸을 내가 적는 중이면 남의 글은 그 칸에만 안 덮음.
// data-tb = 지점 id (공용·실시간) 또는 "me" (🧠 시뮬레이터 탭 — 대표 개인, my_notes, 나만 봄). data-day 없으면 오늘
// index.html 의 sb·simChannel·today·md·pad·esc·fail·myName·W 를 씀 → window.TB
(() => {
const TB = (window.TB = {});
const HOURS = Array.from({ length: 20 }, (_, i) => i + 5); // 5 … 24(밤 12시)
const key = (h, m) => `${String(h).padStart(2, "0")}:${m}`;
const h12 = (h) => (h % 12 === 0 ? 12 : h % 12);

TB.html = (st, tid, day = "") => {
  const p = st?.plan?.p ?? [], t = st?.plan?.t ?? {};
  return `<div class="tb" data-tb="${tid}" ${day ? `data-day="${day}"` : ""}>
    <div class="tbL">
      <div class="tbPri"><div class="tbH">우선순위 3가지</div>${[0, 1, 2].map((i) => `<label><b>${i + 1}.</b><input data-k="p${i}" value="${esc(p[i] ?? "")}" placeholder="가장 중요한 일"></label>`).join("")}</div>
      <div class="tbDH">브레인 덤프 — 옮겨 적기</div>
      <textarea class="tbDump" data-k="body" placeholder="떠오르는 걸 다 적고, 시간표로 옮겨 적어요">${esc(st?.body ?? "")}</textarea>
    </div>
    <div class="tbR"><table><tr><th>시간</th><th>:00</th><th>:30</th></tr>${HOURS.map((h) => `<tr class="${h >= 12 && h < 24 ? "pm" : ""}"><td class="h">${h12(h)}</td>`
      + ["00", "30"].map((m) => `<td><input data-k="t${key(h, m)}" value="${esc(t[key(h, m)] ?? "")}"></td>`).join("") + `</tr>`).join("")}</table></div>
  </div>`;
};
// 칸들 → 저장할 모양
TB.read = (root) => {
  const v = (k) => root.querySelector(`[data-k="${k}"]`)?.value ?? "", t = {};
  root.querySelectorAll('[data-k^="t"]').forEach((el) => { if (el.value.trim()) t[el.dataset.k.slice(1)] = el.value; });
  return { body: v("body"), plan: { p: [0, 1, 2].map((i) => v(`p${i}`)), t } };
};
// 받은 걸 칸에 — 지금 내가 적는 칸만 빼고
TB.apply = (root, st) => {
  const want = { body: st.body ?? "" };
  (st.plan?.p ?? []).forEach((x, i) => (want[`p${i}`] = x ?? ""));
  root.querySelectorAll('[data-k^="t"]').forEach((el) => (want[el.dataset.k] = st.plan?.t?.[el.dataset.k.slice(1)] ?? ""));
  if (!st.plan) Object.keys(want).forEach((k) => k !== "body" && delete want[k]); // 예전 화면은 글(body)만 보냄
  for (const [k, v] of Object.entries(want)) { const el = root.querySelector(`[data-k="${k}"]`); if (el && el !== document.activeElement && el.value !== v) el.value = v; }
  TB.grow(root);
};
TB.grow = (root) => { const d = root.querySelector(".tbDump"); if (d) { d.style.height = "auto"; d.style.height = Math.max(160, d.scrollHeight + 2) + "px"; } };
// 남이 적은 것 → 그 지점 타임박스 전부(메인 칸·현황 카드)
TB.remote = (tid, p) => {
  if (p.day !== today()) return;
  const st = p.state ?? { body: p.body };
  document.querySelectorAll(`.tb[data-tb="${tid}"]`).forEach((root) => {
    TB.apply(root, st);
    const who = root.closest("details")?.querySelector("summary small"); if (!who) return;
    who.textContent = `✍️ ${p.who} 적는 중…`; clearTimeout(who._t);
    who._t = setTimeout(() => { const n = new Date(); who.textContent = `${md(today())} · ${p.who} ${pad(n.getHours())}:${pad(n.getMinutes())} 저장`; }, 2500);
  });
};
// 내가 적으면: 0.15초 모아 실시간 전송 · 0.7초 뒤 저장 (다른 열린 타임박스에도 바로 반영)
const timers = new Map();
document.addEventListener("input", (e) => {
  const el = e.target.closest?.(".tb [data-k]"); if (!el) return;
  const root = el.closest(".tb"), mine = root.dataset.tb === "me", tid = mine ? "me" : +root.dataset.tb, day = root.dataset.day || today();
  const who = mine ? document.getElementById("mySimWho") : root.closest("details")?.querySelector("summary small");
  if (el.classList.contains("tbDump")) TB.grow(root);
  if (who) who.textContent = "적는 중…";
  const tm = timers.get(tid) ?? {}; timers.set(tid, tm);
  if (!mine) clearTimeout(tm.send); if (!mine) tm.send = setTimeout(() => {
    const st = TB.read(root);
    document.querySelectorAll(`.tb[data-tb="${tid}"]`).forEach((r) => r !== root && TB.apply(r, st));
    simChannel(tid, (p) => TB.remote(tid, p), "tb").send({ type: "broadcast", event: "text", payload: { day: today(), state: st, body: st.body, who: myName } });
  }, 150);
  clearTimeout(tm.save); tm.save = setTimeout(async () => {
    const st = TB.read(root);
    const { error } = mine ? await sb.from("my_notes").upsert({ day, body: st.body, plan: st.plan, updated_at: new Date().toISOString() })
      : await sb.rpc("team_note_set", { p_day: today(), p_body: st.body, p_team: tid, p_plan: st.plan }); if (fail(error)) return;
    const n = new Date(); if (who) who.textContent = `${md(day)} · ${pad(n.getHours())}:${pad(n.getMinutes())} 저장됨`;
  }, 700);
});
// 🧠 시뮬레이터 탭 (대표 개인): 날짜 ‹ 오늘 › · 하루 하나
TB.myDay = null;
TB.loadMine = async (day) => {
  const v = document.getElementById("mySimView"); if (!v) return;
  TB.myDay = day ?? TB.myDay ?? today();
  const d = TB.myDay, DOWS = "일월화수목금토", wd = DOWS[W.parse(d).getDay()];
  const { data, error } = await sb.from("my_notes").select("body, plan, updated_at").eq("day", d).maybeSingle(); if (fail(error)) return;
  v.innerHTML = `<div class="mysimbar"><h2>🧠 시뮬레이터 <small>내 타임박스 · 나만 봐요</small></h2>
      <span class="mysimnav"><button data-myd="-1">‹</button><b>${md(d)}(${wd})${d === today() ? " · 오늘" : ""}</b><button data-myd="1">›</button>${d !== today() ? `<button data-myd="0">오늘</button>` : ""}</span>
      <small id="mySimWho">${data?.updated_at ? `${md(d)} · ${pad(new Date(data.updated_at).getHours())}:${pad(new Date(data.updated_at).getMinutes())} 저장` : "아직 없음"}</small></div>
    <div class="mysimcard">${TB.html({ body: data?.body, plan: data?.plan }, "me", d)}</div>`;
  TB.grow(v.querySelector(".tb"));
};
document.addEventListener("click", (e) => {
  const b = e.target.closest?.("#mySimView [data-myd]"); if (!b) return;
  const n = +b.dataset.myd; TB.loadMine(n ? W.add(TB.myDay, n) : today());
});
// 칸에서 Enter = 아래 칸으로 (시간표 빨리 채우기)
document.addEventListener("keydown", (e) => {
  const el = e.target.closest?.(".tb input[data-k]"); if (!el || e.key !== "Enter" || e.isComposing) return;
  e.preventDefault(); const all = [...el.closest(".tb").querySelectorAll("input[data-k]")], i = all.indexOf(el);
  const col = el.closest("td"), tr = el.closest("tr"); // 시간표: 같은 열 아래 줄
  const next = col && tr?.nextElementSibling ? tr.nextElementSibling.children[col.cellIndex]?.querySelector("input") : all[i + 1];
  next?.focus();
});
})();
