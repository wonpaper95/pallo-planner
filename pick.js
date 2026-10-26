// 🕐 시작시간 · ⏳ 예상시간 · 📅 데드라인 작은 선택창 (플래너·위젯·크롬 확장 공용 — 한 곳만 고치면 다 같이 바뀜)
const minLabel = (m) => m < 60 ? `${m}분` : m % 60 ? `${Math.floor(m / 60)}시간 ${m % 60}분` : `${m / 60}시간`;
const p2 = (n) => String(n).padStart(2, "0");
function fmtDl(iso) { const d = new Date(iso); return `${d.getMonth() + 1}/${d.getDate()}(${"일월화수목금토"[d.getDay()]}) ${p2(d.getHours())}:${p2(d.getMinutes())}`; }
const toLocalInput = (iso) => { const d = new Date(iso); return `${W.ymd(d)}T${p2(d.getHours())}:${p2(d.getMinutes())}`; };
// 추천 9개 + 아래 시간칸은 처음부터 '오후 02:30'처럼 채워둠(정해진 시각, 없으면 지금에서 가까운 30분)
function startPickHtml(t) {
  const now = new Date(), nowHm = `${p2(now.getHours())}:${p2(Math.floor(now.getMinutes() / 5) * 5)}`;
  const half = new Date(Math.ceil(now.getTime() / 1800000) * 1800000), def = t.start_time?.slice(0, 5) ?? `${p2(half.getHours())}:${p2(half.getMinutes())}`;
  return `<div class="grid"><button data-v="${nowHm}">지금</button>${["09:00", "10:00", "11:00", "13:00", "14:00", "15:00", "16:00", "18:00"].map((h) =>
    `<button data-v="${h}" class="${t.start_time?.slice(0, 5) === h ? "on" : ""}">${h}</button>`).join("")}</div>
    <div class="own"><input type="time" value="${def}"><button class="btn" data-own>확인</button></div>
    ${t.start_time ? `<button class="clear" data-v="">지우기</button>` : ""}`;
}
// 데드라인 빠른 선택. clear 면 null
function quickDl(t, q) {
  const at = (day, h) => { const d = W.parse(day); d.setHours(h, 0, 0, 0); return d; }, td = W.ymd(new Date());
  const base = t.deadline ? new Date(t.deadline) : at(t.day, 18);
  return q === "today18" ? at(td, 18) : q === "tom9" ? at(W.add(td, 1), 9) : q === "tom18" ? at(W.add(td, 1), 18)
    : q === "+1d" ? new Date(base.getTime() + 86400000) : q === "+1w" ? new Date(base.getTime() + 7 * 86400000) : null;
}
// 선택창 내용. locked = 대표님이 정한 데드라인(매니저는 못 바꿈)
function pickHtml(t, kind, locked) {
  if (kind === "est") return `<h4>⏳ 예상 소요시간</h4><div class="grid">${[15, 30, 45, 60, 90, 120, 180, 240, 480].map((m) =>
      `<button data-v="${m}" class="${t.estimate_min === m ? "on" : ""}">${minLabel(m)}</button>`).join("")}</div>
      <div class="own"><input type="number" min="1" inputmode="numeric" placeholder="직접 (분)"><button class="btn" data-own>확인</button></div>
      ${t.estimate_min ? `<button class="clear" data-v="">지우기</button>` : ""}`;
  if (kind === "dl") return locked ? `<h4>📅 데드라인</h4><div style="font-size:13px">대표님이 정한 데드라인이라 바꿀 수 없어요${t.deadline ? `<br><b>${fmtDl(t.deadline)}</b>` : ""}</div>`
      : `<h4>📅 ${t.deadline ? "데드라인 재설정" : "데드라인 (고르면 설정돼요)"}</h4>
      <div class="own"><input type="datetime-local" value="${toLocalInput(t.deadline ?? new Date())}"><button class="btn" data-own>확인</button></div>
      <div class="grid" style="margin-top:6px">${[["today18", "오늘 18:00"], ["tom9", "내일 09:00"], ["tom18", "내일 18:00"], ["+1d", "+1일"], ["+1w", "+1주"]].map(([q, l]) => `<button data-q="${q}">${l}</button>`).join("")}</div>
      ${t.deadline ? `<button class="clear" data-q="clear">지우기</button>` : ""}
      ${(t.deadline_log || []).length ? `<div style="font-size:12px;color:var(--sub);margin-top:6px">↻ 재설정 ${t.deadline_log.length}회 · 마지막 ${fmtDl(t.deadline_log.at(-1).from)} → ${t.deadline ? fmtDl(t.deadline) : "없음"}</div>` : ""}`;
  return `<h4>🕐 업무 시작시간</h4>` + startPickHtml(t);
}
// ⏳ 해결목표 고른 뒤 질문: 이 시간 안에 끝내기(카운트다운·끝나면 알림) 할지
const cdAskHtml = (t, m) => `<h4>⏰ ${minLabel(m)} 카운트다운 할까요?</h4>
  <div style="font-size:12px;color:var(--sub);margin-bottom:8px">▶ 누르면 남은 시간이 줄어들고, 끝나면 알림이 와요</div>
  <div class="grid" style="grid-template-columns:1fr 1fr"><button data-cd="1" data-m="${m}" class="${t.countdown ? "on" : ""}">⏰ 네, 카운트다운</button><button data-cd="0" data-m="${m}" class="${t.countdown ? "" : "on"}">아니요, 시간만</button></div>`;
// 누른 버튼 → 저장할 값. 아직 고른 게 아니면 undefined
function pickPatch(t, kind, b, pop) {
  const own = b.dataset.own !== undefined, v = own ? pop.querySelector("input").value : b.dataset.v;
  if (kind === "dl") {
    const d = b.dataset.q ? quickDl(t, b.dataset.q) : own && v ? new Date(v) : undefined;
    return d === undefined ? undefined : { deadline: d ? d.toISOString() : null };
  }
  if (kind === "est" && b.dataset.cd !== undefined) return { estimate_min: +b.dataset.m, countdown: b.dataset.cd === "1" };
  if (v === undefined) return undefined;
  if (kind === "est" && +v > 0) { pop.innerHTML = cdAskHtml(t, Math.round(+v)); return undefined; } // 바로 저장 말고 물어봄
  return kind === "est" ? { estimate_min: null, countdown: false } : { start_time: v || null };
}
// 버튼 밑(공간 없으면 위)에 띄우기
function placePop(pop, anchor) {
  pop.classList.remove("hidden");
  const r = anchor.getBoundingClientRect(), w = pop.offsetWidth, h = pop.offsetHeight;
  pop.style.left = Math.max(8, Math.min(r.right - w, innerWidth - w - 8)) + "px";
  pop.style.top = (r.bottom + h + 8 > innerHeight ? Math.max(8, r.top - h - 6) : r.bottom + 6) + "px";
}

// 📷 고정업무 인증샷 (플래너·위젯·확장 공용): 사진 고르기 → 긴 쪽 1280px JPEG 로 줄여 Storage 'routine-photos' 에 올리고 공개 주소 반환
function pickPhoto() { // 취소하면 null
  return new Promise((res) => {
    const inp = Object.assign(document.createElement("input"), { type: "file", accept: "image/*", hidden: true });
    inp.onchange = () => { res(inp.files[0] || null); inp.remove(); };
    inp.oncancel = () => { res(null); inp.remove(); };
    document.body.appendChild(inp); inp.click();
  });
}
async function shrinkImage(file, max = 1280) { // 폰 원본 3~5MB → 200KB 안팎. 못 줄이면(HEIC 등) 원본 그대로
  try {
    const bmp = await createImageBitmap(file), s = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas"); c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    return (await new Promise((r) => c.toBlob(r, "image/jpeg", 0.82))) || file;
  } catch { return file; }
}
async function uploadRoutinePhoto(sb, file, itemId) {
  const blob = await shrinkImage(file), jpg = blob !== file;
  const ext = jpg ? "jpg" : (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `${W.ymd(new Date())}/${itemId}-${crypto.randomUUID()}.${ext}`;
  const { error } = await sb.storage.from("routine-photos").upload(path, blob, { contentType: jpg ? "image/jpeg" : file.type || "image/jpeg", cacheControl: "31536000" });
  if (error) throw error;
  return sb.storage.from("routine-photos").getPublicUrl(path).data.publicUrl;
}
const isPhotoLink = (u) => /\/routine-photos\//.test(u || "");
