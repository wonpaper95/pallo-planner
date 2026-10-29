// 🕒 근무기록지 계산 (work.js·tools/test-work.js 공용) → window.WRC
// 근무시간 글 → 정해진 시간 {"1am":2.5, "3pm":4.25, "6d":4} (요일 0=일..6=토, 월~목 = 오전 am/오후 pm, 금·토·일 = 한 칸 d)
(() => {
const KD = "일월화수목금토";
const split = (dow) => dow >= 1 && dow <= 4;
const slotsOf = (dow) => (split(dow) ? ["am", "pm"] : ["d"]);
const num = (v) => { // '２'·' 2.5 ' 같은 글자 숫자도 숫자로 (시트 SUM 은 빠뜨렸음)
  const s = String(v ?? "").trim().replace(/[０-９．]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
  return s !== "" && isFinite(s) ? +s : null;
};
function lineHours(t) {
  const hm = t.match(/(\d+)\s*h\s*(\d+)\s*m/i); if (hm) return +hm[1] + hm[2] / 60; // (4h 30m)
  const m = [...t.matchAll(/(\d+(?:\.\d+)?)\s*h/gi)].pop() ?? [...t.matchAll(/(\d+(?:\.\d+)?)\s*시간/g)].pop();
  if (!m) return null;
  const tm = t.match(/(\d{1,2}):(\d{2})\s*~\s*(\d{1,2}):(\d{2})/), frac = m[1].split(".")[1];
  if (tm && /^(15|30|45)$/.test(frac ?? "")) { // '2.30h' = 2시간 30분? 시각으로 확인
    const diff = (tm[3] * 60 + +tm[4] - tm[1] * 60 - tm[2]) / 60;
    if (Math.abs(diff - (Math.floor(+m[1]) + frac / 60)) < 0.01) return diff;
  }
  return +m[1];
}
function parseShift(text) {
  const plan = {};
  for (const raw of String(text ?? "").split("\n")) {
    const h = lineHours(raw); if (h == null) continue;
    const t = raw.replace(/\([^)]*\)/g, " "); // 괄호 속(시각·'한국어(1월~)')은 요일로 안 읽음
    const named = [...t.replace(/평일|주말|종일|일본어|일어|요일/g, " ")].filter((ch) => KD.includes(ch)).map((ch) => KD.indexOf(ch));
    const days = new Set(named.length ? named : [...(/평일/.test(t) ? [1, 2, 3, 4] : []), ...(/주말/.test(t) ? [6, 0] : [])]); // '화목 평일' = 화·목만
    const time = raw.match(/(\d{1,2}):\d{2}\s*~/), am = /오전/.test(raw) || (!/오후|저녁/.test(raw) && (!time || +time[1] < 14));
    for (const d of days) { const k = d + (split(d) ? (am ? "am" : "pm") : "d"); plan[k] = (plan[k] ?? 0) + h; }
  }
  return plan;
}
// 정해진 시간과 차이 (정해진 시간이 없는 줄 — 대타·백업 — 이나 빈 칸은 0)
const off = (plan, dow, slot, val) => { const got = num(val); return got == null || !Object.keys(plan).length ? 0 : Math.round((got - (plan[dow + slot] ?? 0)) * 100) / 100; };
const needReason = (plan, dow, slot, c) => !!c && !c.reason?.trim() && c.mark !== "sub" && off(plan, dow, slot, c.val) !== 0; // 🟢 대타 근무는 사유 대신
const planText = (plan) => {
  const by = {}; for (const [k, h] of Object.entries(plan)) (by[`${k.slice(1)}|${h}`] ??= []).push(+k[0]);
  const SL = { am: "오전", pm: "오후", d: "" };
  return Object.entries(by).map(([k, ds]) => { const [s, h] = k.split("|"); return `${ds.sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((d) => KD[d]).join("·")}${SL[s] ? " " + SL[s] : ""} ${+h}h`; }).join(", ");
};
// 근무시간 고르기(추가 폼) → 근무시간 글 한 줄. 월~목은 시작 14시 전 = 오전, 금·토·일은 한 칸이라 오전/오후 없음
const DAYSETS = [["평일", "평일 (월~목)"], ["월수", "월·수"], ["화목", "화·목"], ["월", "월"], ["화", "화"], ["수", "수"], ["목", "목"], ["주말", "주말 (토·일)"], ["토", "토"], ["일", "일"], ["금", "금"]];
const mins = (hm) => +hm.slice(0, 2) * 60 + +hm.slice(3, 5);
const shiftLine = (days, start, end, h) => `${days}${/^(주말|토|일|금)$/.test(days) ? "" : mins(start) < 14 * 60 ? " 오전" : " 오후"} (${start}~${end})(${h}h)`;
window.WRC = { KD, split, slotsOf, num, parseShift, off, needReason, planText, DAYSETS, mins, shiftLine };
})();
