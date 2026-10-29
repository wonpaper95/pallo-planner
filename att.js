// 📷 [출석 스캔] 탭 — 종이 출석부를 폰으로 찍어 올리면 맥 예약 작업(pallo-attendance-scan-sync)이 읽고 전산 명단과 맞춰 확인표를 만든다 (DB 0076_att_scan)
// 흐름: new(올라옴) → 맥이 대조 → review(확인표) → 지점이 고치고 ✅ → ok → 맥이 전산 출석 처리 → done / error
// 확인표 줄(rows) 모양: { role: "리더"|"회원", read: "사진에서 읽은 이름 뒷자리", name, phone: 전산 회원(없으면 ""), cls: 전산 수업 이름,
//   table: "11", state: 전산 상태(결석·출석…), act: "in"(출석 처리) | "skip"(안 함) | "ask"(확인 필요), why: 이유, res: 입력 결과 }
// 맥(대표 계정 플래너 탭)은 AT.queue · AT.review · AT.finish 를 javascript 로 부름. index.html 의 sb·myRole·previewTeam·teams·myName·esc·toast·fail·today 를 씀
(() => {
const AT = (window.AT = { team: null, list: [] });
const V = () => document.getElementById("atView");
const admin = () => myRole === "admin" && !previewTeam;
const jo = () => myRole === "assistant";
const ST = { new: "⏳ 맥이 읽는 중 (10~20분)", review: "📝 확인해 주세요", ok: "✅ 확인 완료 · 전산 입력 대기", done: "🎉 전산 입력 완료", error: "⚠️ 문제 있음" };
const ACT = { in: "출석 처리", skip: "안 함", ask: "확인 필요" };
const SLOTS = ["", "오전", "오후 6시", "오후 8시"];
const CODE = () => Object.fromEntries(Object.entries(window.LDC?.JEONSAN ?? {}).map(([code, name]) => [name, code])); // 플래너 지점 이름 → 전산 지점 코드
const md = (s) => { const d = new Date(s + "T00:00"); return `${d.getMonth() + 1}/${d.getDate()}(${"일월화수목금토"[d.getDay()]})`; };
const ts = (s) => new Date(s).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });

AT.load = async function () {
  if (admin()) { if (!AT.team) { try { AT.team = +localStorage.getItem("at-team") || null; } catch {} } if (!teams.some((t) => t.id === AT.team)) AT.team = teams.find((t) => t.name === "대구일중점")?.id ?? teams[0]?.id ?? null; }
  else AT.team = previewTeam ?? (await sb.rpc("my_team")).data ?? (await sb.rpc("assistant_team")).data ?? null;
  if (!AT.team) { V().innerHTML = `<div class="atbar"><h2>📷 출석 스캔</h2></div><div class="card mut">지점이 정해져야 쓸 수 있어요 — 대표님께 말씀해 주세요</div>`; return; }
  const r = await sb.from("att_scans").select("*").eq("team_id", AT.team).order("created_at", { ascending: false }).limit(40);
  if (fail(r.error)) return;
  AT.list = r.data;
  await sign(AT.list.map((x) => x.path));
  render(); listen();
};

// 사진: 비공개 버킷이라 서명 주소(1시간), 깜빡임 막으려고 50분 재사용
const signed = new Map();
async function sign(paths) {
  const need = paths.filter((p) => !(signed.get(p)?.at > Date.now() - 50 * 60e3));
  if (!need.length) return;
  const { data } = await sb.storage.from("att-photos").createSignedUrls(need, 3600);
  for (const d of data ?? []) if (d.signedUrl) signed.set(d.path, { url: d.signedUrl, at: Date.now() });
}

let chan = null;
function listen() {
  if (chan) return;
  const soon = () => { clearTimeout(soon.t); soon.t = setTimeout(() => view === "at" && AT.load(), 300); };
  chan = sb.channel("att").on("postgres_changes", { event: "*", schema: "public", table: "att_scans" }, soon).subscribe();
}

function render() {
  const draft = { day: V().querySelector("#atDay")?.value || today(), slot: V().querySelector("#atSlot")?.value ?? "" };
  V().innerHTML = `<div class="atbar"><h2>📷 출석 스캔</h2>${admin() ? `<select id="atTeam">${teams.map((t) => `<option value="${t.id}" ${t.id === AT.team ? "selected" : ""}>${esc(t.name)}</option>`).join("")}</select>` : ""}</div>
  <div class="card atup">
    <div class="atrow"><label>수업 날짜 <input type="date" id="atDay" value="${esc(draft.day)}"></label>
      <label>타임 <select id="atSlot">${SLOTS.map((s) => `<option value="${esc(s)}" ${s === draft.slot ? "selected" : ""}>${s || "모름"}</option>`).join("")}</select></label></div>
    <label class="btn atcam">📷 출석부 찍기<input type="file" id="atFile" accept="image/*" capture="environment" multiple hidden></label>
    <div class="mut atguide">한 장씩 · 위에서 반듯하게 · 출석부가 화면에 꽉 차게 · 그림자 없이. 갤러리 사진도 됩니다(여러 장 가능).</div>
  </div>
  ${AT.list.length ? AT.list.map(card).join("") : `<div class="card mut">아직 올린 출석부가 없어요.</div>`}`;
}

function card(s) {
  const u = signed.get(s.path)?.url ?? "", edit = s.status === "review", rows = s.rows ?? [];
  const n = (a) => rows.filter((r) => r.act === a).length, one = rows.length && rows.every((r) => r.cls === rows[0].cls); // 수업이 하나면 칸 대신 위에 한 번 (폰 폭)
  return `<div class="card atcard" data-id="${s.id}">
    <div class="athead"><a href="${esc(u)}" target="_blank" rel="noopener"><img src="${esc(u)}" alt="출석부" loading="lazy"></a>
      <div class="atinfo"><b>${md(s.class_day)} ${esc(s.slot)}</b> <span class="atst ${s.status}">${ST[s.status]}</span>
        <div class="mut">${esc(s.by_name)} · ${ts(s.created_at)}${s.checked_by ? ` · ✅ ${esc(s.checked_by)}` : ""}</div>
        ${one ? `<div>📚 ${esc(rows[0].cls)}</div>` : ""}${rows.length ? `<div class="mut">출석 처리 ${n("in")} · 안 함 ${n("skip")}${n("ask") ? ` · <b class="atask">확인 필요 ${n("ask")}</b>` : ""}</div>` : ""}
        ${s.note ? `<div class="atnote">${esc(s.note)}</div>` : ""}</div>
      ${jo() ? "" : `<button class="btn ghost atdel" title="지우기">🗑</button>`}</div>
    ${rows.length ? `<div class="atscroll"><table class="att"><thead><tr><th>할 일</th><th>사진에서 읽음</th><th>전산 회원</th><th>테이블</th><th>역할</th>${one ? "" : "<th>수업</th>"}<th>전산 상태</th>${s.status === "done" || s.status === "error" ? "<th>결과</th>" : ""}</tr></thead><tbody>
      ${rows.map((r, i) => `<tr class="${r.act}" data-i="${i}">
        <td class="atw">${edit ? `<select class="atact">${Object.entries(ACT).map(([k, l]) => `<option value="${k}" ${k === r.act ? "selected" : ""}>${l}</option>`).join("")}</select>` : ACT[r.act] ?? ""}${r.why ? `<div class="mut">${esc(r.why)}</div>` : ""}</td>
        <td>${esc(r.read)}</td><td>${r.name ? `${esc(r.name)} <span class="mut">${esc(r.phone.slice(-4))}</span>` : `<span class="mut">없음</span>`}</td>
        <td>${edit ? `<input class="attb" value="${esc(r.table)}" size="3" inputmode="numeric">` : esc(r.table)}</td><td>${esc(r.role)}</td>${one ? "" : `<td>${esc(r.cls)}</td>`}<td>${esc(r.state)}</td>
        ${s.status === "done" || s.status === "error" ? `<td class="atw">${esc(r.res ?? "")}</td>` : ""}</tr>`).join("")}</tbody></table></div>` : ""}
    ${edit ? `<div class="atrow"><button class="btn atok">✅ 이대로 전산에 입력</button><span class="mut">'확인 필요'가 남아 있으면 출석 처리나 안 함으로 골라 주세요</span></div>` : ""}
  </div>`;
}

async function upload(files) {
  const day = V().querySelector("#atDay").value || today(), slot = V().querySelector("#atSlot").value, t = AT.team;
  toast(`출석부 ${files.length}장 올리는 중…`);
  let ok = 0;
  for (const p of await PHOTO.fromFiles(files)) {
    const path = `${t}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`;
    const up = await sb.storage.from("att-photos").upload(path, await shrink(p.img), { contentType: "image/jpeg" });
    if (fail(up.error)) break;
    const r = await sb.from("att_scans").insert({ team_id: t, path, class_day: day, slot, by_name: myName ?? "" });
    if (fail(r.error)) { await sb.storage.from("att-photos").remove([path]); break; }
    ok++;
  }
  if (ok) { toast(`${ok}장 올렸어요 · 10~20분 안에 확인표가 떠요`); AT.load(); }
}
// 긴 변 2000px JPG (손글씨 읽어야 해서 조교체크리스트 1600px 보다 크게)
async function shrink(img) {
  const k = Math.min(1, 2000 / Math.max(img.naturalWidth, img.naturalHeight)), c = document.createElement("canvas");
  c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  return new Promise((ok) => c.toBlob(ok, "image/jpeg", 0.9));
}

async function confirm(el) {
  const s = AT.list.find((x) => x.id === +el.dataset.id), rows = structuredClone(s.rows);
  el.querySelectorAll("tbody tr").forEach((tr) => { const r = rows[+tr.dataset.i]; r.table = tr.querySelector(".attb").value.trim(); r.act = tr.querySelector(".atact").value; });
  if (rows.some((r) => r.act === "ask")) return toast("'확인 필요' 줄을 출석 처리나 안 함으로 골라 주세요");
  if (rows.some((r) => r.act === "in" && (!r.name || !r.table))) return toast("출석 처리할 줄은 전산 회원과 테이블이 있어야 해요");
  const r = await sb.from("att_scans").update({ rows, status: "ok", checked_by: myName ?? "", checked_at: new Date().toISOString() }).eq("id", s.id).eq("status", "review");
  if (!fail(r.error)) { toast("✅ 확인 완료 · 다음 맥 작업 때 전산에 들어가요"); AT.load(); }
}

document.addEventListener("change", (e) => {
  if (!e.target.closest("#atView")) return;
  if (e.target.id === "atTeam") { AT.team = +e.target.value; try { localStorage.setItem("at-team", AT.team); } catch {} AT.load(); }
  if (e.target.id === "atFile" && e.target.files.length) { const f = [...e.target.files]; e.target.value = ""; upload(f); }
});
document.addEventListener("click", async (e) => {
  const c = e.target.closest("#atView .atcard"); if (!c) return;
  if (e.target.closest(".atok")) return confirm(c);
  if (e.target.closest(".atdel")) {
    const s = AT.list.find((x) => x.id === +c.dataset.id);
    if (!window.confirm(`${md(s.class_day)} 출석부를 지울까요? (전산에 들어간 출석은 그대로)`)) return;
    const r = await sb.from("att_scans").delete().eq("id", s.id);
    if (!fail(r.error)) { await sb.storage.from("att-photos").remove([s.path]); AT.load(); }
  }
});

// ── 맥 예약 작업용 (대표 계정 플래너 탭에서 javascript 로 부름) ──
// 할 일: new(사진 읽고 대조할 것) + ok(전산에 넣을 것). 사진은 1시간 서명 주소, 지점은 전산 코드로
AT.queue = async function () {
  const r = await sb.from("att_scans").select("id, team_id, path, class_day, slot, status, rows, teams(name)").in("status", ["new", "ok"]).order("created_at");
  if (r.error) throw r.error;
  const { data } = r.data.length ? await sb.storage.from("att-photos").createSignedUrls(r.data.map((x) => x.path), 3600) : { data: [] };
  const code = CODE();
  return r.data.map((x, i) => ({ id: x.id, branch: code[x.teams?.name] ?? null, team: x.teams?.name, class_day: x.class_day, slot: x.slot, status: x.status, rows: x.rows, url: data?.[i]?.signedUrl }));
};
const set = async (id, from, patch) => { const r = await sb.from("att_scans").update(patch).eq("id", id).eq("status", from).select("id"); if (r.error) throw r.error; return r.data.length === 1; };
AT.review = (id, rows, note = "") => set(id, "new", { rows, note, status: "review" });
AT.finish = (id, rows, note = "", ok = true) => set(id, "ok", { rows, note, status: ok ? "done" : "error", done_at: new Date().toISOString() });
AT.fail = (id, note) => set(id, "new", { note, status: "error" }); // 사진을 못 읽음 등
})();
