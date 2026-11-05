// 🔗 연동 오류 탭: 연동 안 된 회원을 처리될 때까지 관리 (대구일중점 매니저·대표만, jpcnTeam 은 index.html loadProfile 이 정함)
// 서버 규칙은 DB 0095 — 다른 지점 안 보임·조교 못 봄. 입력칸 값이 날아가지 않게 #leList 만 다시 그림
(() => {
const LE = (window.LE = { list: [], q: "", cls: "", edit: null, draft: null, doneOpen: null, ready: false, adding: false });
const V = () => document.getElementById("leView");
const $id = (id) => document.getElementById(id);
const CLASSES = ["월수 일본어 11:00", "월수 일본어 18:00", "월수 일본어 20:00", "화목 일본어 11:00", "화목 일본어 18:00", "화목 일본어 20:00", "토일 일본어 11:00", "토일 일본어 14:00", "월수 중국어 20:00", "화목 중국어 11:00", "화목 중국어 20:00"];
const CHECKS = [["card", "회원카드작성"], ["terms", "재약관작성"], ["privacy", "재개인정보동의"], ["diff_branch", "첫지점다름(수기작성)"], ["linked", "연동완"]];
const opts = (cur) => [...(cur && !CLASSES.includes(cur) ? [cur] : []), ...CLASSES].map((c) => `<option value="${esc(c)}"${c === cur ? " selected" : ""}>${esc(c)}</option>`).join("");

function frame() {
  V().innerHTML = `<div class="lebar"><div><h2>🔗 연동 오류</h2><p class="mut">연동 안 된 사람은 처리될 때까지 이름·연락처를 여기서 관리해요</p></div><div class="lecnt" id="leCounts"></div></div>
    <form class="card leadd" id="leForm" autocomplete="off">
      <label>이름<input type="text" id="leName" maxlength="60" placeholder="홍길동"></label>
      <label>연락처<input type="tel" id="lePhone" maxlength="30" placeholder="010-0000-0000"></label>
      <label class="lewide">수업<select id="leClass">${opts()}</select></label>
      <label class="lewide">메모 (선택)<input type="text" id="leMemo" maxlength="500" placeholder="특이사항"></label>
      <button class="btn" type="submit">+ 등록</button>
    </form>
    <div class="lefilter"><input type="text" id="leQ" placeholder="이름 또는 연락처 검색" aria-label="이름 또는 연락처 검색"><select id="leCls" aria-label="수업별 보기"><option value="">전체 수업</option>${opts()}</select></div>
    <div id="leList"></div>`;
  LE.ready = true;
}

const shown = (d) => {
  if (LE.cls && d.class_name !== LE.cls) return false;
  const q = LE.q.trim().toLowerCase(); if (!q) return true;
  const phone = String(d.phone ?? ""); // 하이픈 없이 쳐도 찾게
  return `${d.name} ${phone} ${phone.replace(/\D/g, "")}`.toLowerCase().includes(q);
};
function item(d) {
  if (LE.edit === d.id) {
    const v = LE.draft ?? d;
    return `<div class="card" data-editing="${d.id}"><div class="leed">
        <label>이름<input type="text" class="e-name" maxlength="60" value="${esc(v.name)}"></label>
        <label>연락처<input type="tel" class="e-phone" maxlength="30" value="${esc(v.phone)}"></label>
        <label>수업<select class="e-class">${opts(v.class_name)}</select></label>
        <label>메모<input type="text" class="e-memo" maxlength="500" value="${esc(v.memo)}"></label>
      </div><div class="leedact"><button class="btn" type="button" data-a="save" data-id="${d.id}">저장</button><button class="btn ghost" type="button" data-a="cancel">취소</button></div></div>`;
  }
  const days = d.linked ? 0 : Math.floor((Date.now() - new Date(d.created_at)) / 864e5);
  return `<div class="card"><div class="letop"><div class="leid"><span class="lename">${esc(d.name)}</span><span class="lephone">${esc(d.phone)}</span>
      <span class="lebadge ${/중국어/.test(d.class_name) ? "cn" : "jp"}">${esc(d.class_name)}</span>${days >= 1 ? `<span class="lebadge warn${days >= 3 ? " long" : ""}">대기 ${days}일째</span>` : ""}</div>
      <div class="leact"><button class="btn ghost" type="button" data-a="edit" data-id="${d.id}">수정</button><button class="btn ghost ledel" type="button" data-a="del" data-id="${d.id}">삭제</button></div></div>
    ${d.memo ? `<div class="lememo">${esc(d.memo)}</div>` : ""}
    <div class="lechks">${CHECKS.map(([k, label]) => `<label class="lechk${d[k] ? " on" : ""}"><input type="checkbox" data-id="${d.id}" data-f="${k}"${d[k] ? " checked" : ""}>${label}</label>${k === "diff_branch" && d[k] ? `<input type="text" class="lenote" data-id="${d.id}" data-f="first_branch" maxlength="60" placeholder="지점명 입력" aria-label="첫 지점명" value="${esc(d.first_branch)}">` : ""}`).join("")}</div></div>`;
}
function list() {
  const box = $id("leList"), ed = box.querySelector?.("[data-editing]");
  if (ed?.dataset?.editing && +ed.dataset.editing === LE.edit) LE.draft = { name: ed.querySelector(".e-name").value, phone: ed.querySelector(".e-phone").value, class_name: ed.querySelector(".e-class").value, memo: ed.querySelector(".e-memo").value }; // 쓰던 수정 내용 보존
  const todo = LE.list.filter((d) => !d.linked).length;
  $id("leCounts").innerHTML = `<span class="lepill warn">미완료 ${todo}건</span><span class="lepill good">완료 ${LE.list.length - todo}건</span>`;
  if (!LE.list.length) { box.innerHTML = `<div class="leempty">아직 등록된 항목이 없어요. 위 칸에 이름과 연락처를 입력해 추가해 보세요.</div>`; return; }
  const rows = LE.list.filter(shown), when = (d) => new Date(d.created_at).getTime();
  const open = rows.filter((d) => !d.linked).sort((a, b) => when(a) - when(b)), done = rows.filter((d) => d.linked).sort((a, b) => when(b) - when(a));
  box.innerHTML = `<div class="legroup"><span class="ledot"></span>연동 미완료 (${open.length})</div>${open.length ? open.map(item).join("") : `<div class="leempty">조건에 맞는 미완료 항목이 없어요.</div>`}
    <details id="leDone"${LE.doneOpen ?? (done.length && !open.length) ? " open" : ""}><summary class="legroup"><span class="ledot ok"></span>연동 완료 (${done.length})<span class="lechev">▶</span></summary>${done.length ? done.map(item).join("") : `<div class="leempty">완료된 항목이 없어요.</div>`}</details>`;
}

// 고친 칸만 보냄(같이 쓰는 사람 것을 덮지 않게), 실패하면 되돌림
async function patch(id, p, redraw) {
  const d = LE.list.find((x) => x.id === id); if (!d) return;
  const old = Object.fromEntries(Object.keys(p).map((k) => [k, d[k]]));
  Object.assign(d, p); if (redraw) list();
  const { data, error } = await sb.from("link_errors").update(p).eq("id", id).select("id");
  if (fail(error)) { Object.assign(d, old); return list(); }
  if (!data?.length) { toast("이미 지워진 항목이에요"); LE.load(); }
}
function wire() {
  const v = V();
  v.addEventListener("submit", async (e) => {
    e.preventDefault(); if (LE.adding) return;
    const name = $id("leName").value.trim();
    if (!name) { toast("이름을 적어 주세요"); return $id("leName").focus(); }
    LE.adding = true;
    const { data, error } = await sb.from("link_errors").insert({ team_id: jpcnTeam, name, phone: $id("lePhone").value.trim(), class_name: $id("leClass").value, memo: $id("leMemo").value.trim() }).select().single();
    LE.adding = false;
    if (fail(error)) return; // 입력값은 그대로 둠
    LE.list.push(data); for (const k of ["leName", "lePhone", "leMemo"]) $id(k).value = "";
    list(); $id("leName").focus();
  });
  v.addEventListener("input", (e) => {
    if (e.target.id === "leQ") { LE.q = e.target.value; list(); }
  });
  v.addEventListener("change", (e) => {
    const t = e.target;
    if (t.id === "leCls") { LE.cls = t.value; return list(); }
    if (!t.dataset?.f) return;
    if (t.type === "checkbox") return patch(+t.dataset.id, { [t.dataset.f]: t.checked }, true);
    patch(+t.dataset.id, { [t.dataset.f]: t.value.trim() }, false); // 다시 그리면 지금 누른 칸이 사라져 클릭이 씹힘
  });
  v.addEventListener("toggle", (e) => { if (e.target.id === "leDone") LE.doneOpen = e.target.open; }, true);
  v.addEventListener("click", async (e) => {
    const b = e.target.closest?.("[data-a]"); if (!b) return;
    const a = b.dataset.a, id = +b.dataset.id;
    if (a === "edit") { LE.edit = id; LE.draft = null; return list(); }
    if (a === "cancel") { LE.edit = null; LE.draft = null; return list(); }
    if (a === "save") {
      const r = b.closest("[data-editing]"), name = r.querySelector(".e-name").value.trim();
      if (!name) return toast("이름을 적어 주세요");
      const p = { name, phone: r.querySelector(".e-phone").value.trim(), class_name: r.querySelector(".e-class").value, memo: r.querySelector(".e-memo").value.trim() };
      r.removeAttribute("data-editing"); LE.edit = null; LE.draft = null;
      return patch(id, p, true);
    }
    if (a === "del") {
      if (!b.classList.contains("on")) { // 두 번 눌러야 지움 (3초 안에)
        b.classList.add("on"); b.textContent = "정말 삭제?";
        setTimeout(() => { b.classList.remove("on"); b.textContent = "삭제"; }, 3000);
        return;
      }
      const { error } = await sb.from("link_errors").delete().eq("id", id);
      if (fail(error)) return;
      LE.list = LE.list.filter((x) => x.id !== id); list();
    }
  });
}

LE.load = async function () {
  if (!jpcnTeam) return;
  if (!LE.ready) { frame(); wire(); list(); }
  const { data, error } = await sb.from("link_errors").select("*").eq("team_id", jpcnTeam);
  if (fail(error)) return;
  LE.list = data ?? []; list();
};
})();
