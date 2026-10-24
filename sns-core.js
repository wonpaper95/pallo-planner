// 📸 게시물 탭 계산 모음 (브라우저 window.SNSCORE · Node require 겸용). 화면·DB와 무관한 순수 함수만 둔다.
// 채널 규칙은 docs/sns-posts/README.md "채널별 변형 규칙" 표와 맞춘다. 네이버·당근 제한은 실제 화면에서 확인되면 LIMITS 에 추가.
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api; else root.SNSCORE = api;
})(typeof self !== "undefined" ? self : globalThis, function () {

// 1단계는 넷 다 수동(복사·사진 받기). 2단계에서 instagram, 3단계에서 google 의 auto 를 true 로 바꾼다.
const CHANNELS = [
  { key: "instagram", label: "📸 인스타", auto: false, open: "https://www.instagram.com/" },
  { key: "google", label: "🔎 구글", auto: false, open: "https://business.google.com/" },
  { key: "naver", label: "🟢 네이버", auto: false, open: "https://new.smartplace.naver.com/" },
  { key: "daangn", label: "🥕 당근", auto: false, open: "https://business.daangn.com/" },
];
const LIMITS = {
  instagram: { body: 2200, tagsMin: 15, tagsMax: 20, tagsHard: 30, photosMax: 10 },
  google: { body: 1500 },
  naver: { title: 20 },
  daangn: {},
};
const BANNED = ["컬컴", "CULCOM", "culcom", "100%", "무조건", "보장", "1등", "1위", "최고", "최저가", "완벽"];
const GOOGLE_TYPES = { standard: "일반 소식", event: "이벤트", offer: "혜택" };
const GOOGLE_BUTTONS = { none: "버튼 없음", call: "전화", book: "예약", learn_more: "자세히 알아보기" };

const s = (v) => String(v ?? "");
const len = (v) => [...s(v)].length;
const has = (o, k) => typeof k === "string" && Object.hasOwn(o, k);

function parseTags(text) {
  return [...new Set(s(text).split(/[\s,]+/).map((t) => t.replace(/^#+/, "")).filter(Boolean))];
}
const tagLine = (tags) => parseTags((Array.isArray(tags) ? tags : []).join(" ")).map((t) => "#" + t).join(" ");

function normalizeChannels(o = {}) {
  const ig = o.instagram ?? {}, g = o.google ?? {}, n = o.naver ?? {}, d = o.daangn ?? {};
  return {
    instagram: { caption: s(ig.caption), hashtags: parseTags((Array.isArray(ig.hashtags) ? ig.hashtags : []).join(" ")) },
    google: { body: s(g.body), type: has(GOOGLE_TYPES, g.type) ? g.type : "standard", button: has(GOOGLE_BUTTONS, g.button) ? g.button : "none" },
    naver: { title: s(n.title), body: s(n.body) },
    daangn: { title: s(d.title), body: s(d.body) },
  };
}
const normalizeAi = (out = {}) => ({ draft: s(out.draft), self_review: s(out.self_review), channels: normalizeChannels(out) });

function channelText(key, ch = {}) {
  if (key === "instagram") return [s(ch.caption).trim(), tagLine(ch.hashtags)].filter(Boolean).join("\n\n");
  if (key === "google") return s(ch.body).trim();
  return [s(ch.title).trim(), s(ch.body).trim()].filter(Boolean).join("\n\n");
}

function checkChannel(key, ch = {}, { photos = 0, unfaced = 0 } = {}) {
  const L = [], add = (lv, txt) => L.push({ lv, txt }), text = channelText(key, ch), lim = LIMITS[key] ?? {};
  const hits = BANNED.filter((w) => text.includes(w));
  add(hits.some((h) => /컬컴|culcom/i.test(h)) ? "bad" : hits.length ? "warn" : "ok", hits.length ? `과장·금지 표현: ${hits.join(", ")}` : "과장·금지 표현 없음");
  const todo = text.split("[확인 필요").length - 1;
  add(todo ? "bad" : "ok", todo ? `[확인 필요] ${todo}곳 — 채우거나 지우고 올리세요` : "[확인 필요] 없음");
  if (key === "instagram") {
    const n = len(text), t = (ch.hashtags ?? []).length;
    add(n <= lim.body ? "ok" : "bad", `캡션 ${n.toLocaleString()}자 (해시태그 포함 ${lim.body.toLocaleString()}자까지)`);
    add(t > lim.tagsHard ? "bad" : t >= lim.tagsMin && t <= lim.tagsMax ? "ok" : "warn", `해시태그 ${t}개 (15~20개 권장, 30개 넘으면 안 올라가요)`);
    add(photos < 1 || photos > lim.photosMax ? "bad" : "ok",
      photos < 1 ? "인스타는 사진이 1장 이상 있어야 해요" : photos > lim.photosMax ? `사진 ${photos}장 — 인스타는 10장까지` : `사진 ${photos}장${photos > 1 ? " (캐러셀)" : ""}`);
  } else if (key === "google") {
    const n = len(text);
    add(n <= lim.body ? "ok" : "bad", `본문 ${n.toLocaleString()}자 (${lim.body.toLocaleString()}자까지)`);
    if (photos > 1) add("info", "구글 소식은 첫 번째 사진 1장만 올라가요");
  } else if (key === "naver") {
    const n = len(ch.title);
    add(n && n <= lim.title ? "ok" : "warn", n ? `제목 ${n}자 (${lim.title}자 안팎 권장)` : "제목이 비어 있어요");
  } else if (key === "daangn") {
    const n = len(ch.title);
    add(n ? "ok" : "warn", n ? `제목 ${n}자` : "제목이 비어 있어요");
  }
  if (photos && unfaced) add("warn", `얼굴 확인 안 한 사진 ${unfaced}장 — 🙂 얼굴 자동 모자이크 또는 [편집]`);
  return L;
}

const jobRows = (post, keys) => keys.map((k) => ({ post_id: post.id, team_id: post.team_id, channel: k, method: "manual", status: "waiting_copy" }));

function fmtKst(iso) {
  const t = new Date(Date.parse(iso) + 9 * 3600e3).toISOString();
  return `${t.slice(5, 7)}/${t.slice(8, 10)} ${t.slice(11, 16)}`;
}
function badge(j) {
  switch (j.status) {
    case "queued": return { cls: "", text: `예약됨 ${fmtKst(j.run_at)}` };
    case "running": return { cls: "", text: "올리는 중…" };
    case "posted": return { cls: "pub", text: "게시됨" };
    case "failed": return { cls: "bad", text: j.error_ko ? `실패 — ${j.error_ko}` : "실패" };
    case "done_manual": return { cls: "pub", text: "올렸어요" };
    default: return { cls: "", text: "복사 대기" };
  }
}
function titleOf(p = {}) {
  const t = s(p.topic).trim() || s(p.draft).split("\n").map((x) => x.trim()).find(Boolean) || "(제목 없음)";
  return len(t) > 40 ? [...t].slice(0, 40).join("") + "…" : t;
}

return { CHANNELS, LIMITS, BANNED, GOOGLE_TYPES, GOOGLE_BUTTONS, parseTags, tagLine, normalizeChannels, normalizeAi, channelText, checkChannel, jobRows, fmtKst, badge, titleOf };
});
