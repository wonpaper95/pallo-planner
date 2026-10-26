// 🔭 경쟁사 광고 정찰 계산 모음 (브라우저 window.MKCCORE · Node require 겸용). 화면·DB·브라우저와 무관한 순수 함수만 둔다.
// 광고 라이브러리 카드의 글줄(innerText)을 필드로 풀고, 집행 기간으로 "잘 돌아가는지"를 추정한다. 성과 숫자는 라이브러리에 없다.
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api; else root.MKCCORE = api;
})(typeof self !== "undefined" ? self : globalThis, function () {

const GROUPS = ["en", "jpcn"];
// 지점 이름 → 그룹 (SQL mkc_group_of_team 과 같은 규칙)
// 우리 지점 페이지 — 라이브러리에서 같이 잡히지만 경쟁사 순위·추천 근거에서는 뺀다
const OWN_PAGE_RE = /팔로|pallo/i;
const isOwnPage = (name) => OWN_PAGE_RE.test(String(name ?? ""));
const groupOfTeamName = (name) => (/(일중|일본어|중국어)/.test(String(name ?? "")) ? "jpcn" : "en");

// 그룹별 검색어. 켜진 경쟁사 페이지는 collect 가 따로 더한다.
const SEARCH_SETS = {
  en: ["영어회화", "영어학원", "성인영어", "영어 스터디", "대구 영어", "울산 영어", "구미 영어", "어학연수", "토익스피킹", "오픽"],
  jpcn: ["일본어회화", "일본어학원", "중국어회화", "중국어학원", "대구 일본어", "대구 중국어", "JLPT", "HSK"],
};

const COUNTRY = "KR";
const searchUrl = (q) => `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=${COUNTRY}&q=${encodeURIComponent(q)}&search_type=keyword_unordered&media_type=all`;
// view_all_page_id 는 숫자 페이지 ID 만 받는다. 카드 링크가 별명(ringleedu 같은)이면 페이지 이름으로 검색한다.
const isNumericPageId = (id) => /^\d+$/.test(String(id ?? ""));
const pageUrl = (pageId) => (isNumericPageId(pageId) ? `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=${COUNTRY}&view_all_page_id=${pageId}` : null);
const competitorUrl = (c) => pageUrl(c.page_id) ?? searchUrl(c.page_name);
const libraryUrl = (id) => `https://www.facebook.com/ads/library/?id=${encodeURIComponent(id)}`;

// 플랫폼 아이콘(인라인 SVG)의 path 앞부분으로 알아본다 (2026-10-26 확인). 툴팁은 숨은 상태라 못 읽는다.
const PLATFORM_PATHS = [
  ["M12 6.022C12 2.696", "facebook"], ["M6 3.227a2.773", "instagram"], ["M6 0c3.17 0 5.74", "audience_network"],
  ["M6 0C2.706 0 0 2.585", "messenger"], ["M4.28 2.92a.523", "whatsapp"], ["M6.006.06c1.72", "threads"],
];
const platformOfPath = (d) => PLATFORM_PATHS.find(([p]) => String(d ?? "").startsWith(p))?.[1] ?? null;

const CTAS = ["지금 신청하기", "신청하기", "더 알아보기", "자세히 보기", "메시지 보내기", "WhatsApp 메시지 보내기", "문의하기", "가입하기", "지금 가입하기", "지금 구매하기", "구매하기", "쇼핑하기", "다운로드", "설치하기", "앱 사용하기", "예약하기", "지금 예약하기", "시청하기", "지금 시청하기", "더 보기", "지금 통화하기", "전화하기", "길찾기", "쿠폰 받기", "견적 받기", "지원하기", "구독하기", "등록하기", "지금 등록하기", "체험하기", "무료 체험", "Learn More", "Sign Up", "Apply Now", "Book Now", "Shop Now", "Download", "Get Offer", "Contact Us", "Send Message"];
const CTA_SET = new Set(CTAS);
const DOMAIN_RE = /^[A-Z0-9][A-Z0-9.-]*\.[A-Z]{2,}(\/\S*)?$/;
const DURATION_RE = /^\d+:\d{2}\s*\/\s*(\d+):(\d{2})$/;
const DETAIL_BUTTONS = ["광고 상세 정보 보기", "요약 세부 사항 보기"];

const pad = (n) => String(n).padStart(2, "0");
// "2026. 8. 19.에 게재 시작함" → "2026-08-19"
function parseStartDate(s) {
  const m = String(s ?? "").match(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\./);
  return m ? `${m[1]}-${pad(m[2])}-${pad(m[3])}` : null;
}
const cleanLines = (lines) => (lines ?? []).map((l) => String(l).replace(/[​‌‍﻿]/g, "").trim()).filter(Boolean);

// FNV-1a 32비트. 같은 문구를 묶는 용도라 암호학적일 필요 없음
function hash(s) {
  let h = 0x811c9dc5;
  for (const ch of String(s)) { h ^= ch.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, "0");
}
const normText = (s) => String(s ?? "").toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");

// 카드 원본(raw) → 저장 필드. raw = { libraryId, lines, platforms, hasVideo, imageCount, pageHref, landingHref }
function parseCard(raw) {
  const lines = cleanLines(raw.lines);
  const out = { library_id: String(raw.libraryId ?? ""), active: true, start_date: null, multi_version: false, n_ads: 1, page_name: "", partner_name: "",
    body: "", headline: "", description: "", cta: "", landing_domain: "", landing_url: "", media_type: "", duration_s: null, platforms: [...new Set(raw.platforms ?? [])] };
  let i = 0;
  if (lines[i] === "활성" || lines[i] === "비활성") { out.active = lines[i] === "활성"; i++; }
  const idLine = lines.findIndex((l) => /^라이브러리 ID:\s*\d+/.test(l));
  if (idLine >= 0) { out.library_id ||= lines[idLine].match(/\d+/)[0]; i = Math.max(i, idLine + 1); }
  for (; i < lines.length; i++) {
    const l = lines[i];
    if (/게재 시작함/.test(l)) out.start_date = parseStartDate(l);
    else if (/여러 버전이 있는 광고/.test(l)) out.multi_version = true;
    else if (/^광고 (\d+)개에서 이 크리에이티브/.test(l)) { out.n_ads = +l.match(/^광고 (\d+)개/)[1]; out.multi_version = true; }
    else if (DETAIL_BUTTONS.includes(l)) { i++; break; }
  }
  // 페이지 줄
  if (i < lines.length && lines[i] !== "광고") {
    const m = lines[i].match(/^(.+?) 페이지는 (.+?)과\(와\) 함께합니다$/);
    if (m) { out.partner_name = m[1]; out.page_name = m[2]; } else out.page_name = lines[i];
    i++;
  }
  if (lines[i] === "광고") i++;
  let rest = lines.slice(i);
  if (rest.length && CTA_SET.has(rest.at(-1))) out.cta = rest.pop();
  const di = rest.findIndex((l) => DURATION_RE.test(l));
  if (di >= 0) { const m = rest[di].match(DURATION_RE); out.duration_s = (+m[1] * 60 + +m[2]) || null; rest.splice(di, 1); } // 0:00 은 메타데이터 못 읽은 것
  const dom = rest.findIndex((l) => DOMAIN_RE.test(l));
  if (dom >= 0) {
    out.landing_domain = rest[dom].split("/")[0].toLowerCase().replace(/^www\./, "");
    out.body = rest.slice(0, dom).join("\n");
    const tail = rest.slice(dom + 1);
    out.headline = tail[0] ?? ""; out.description = tail.slice(1).join(" ");
  } else out.body = rest.join("\n");
  if (raw.landingHref) {
    out.landing_url = String(raw.landingHref);
    try { out.landing_domain ||= new URL(out.landing_url).hostname.replace(/^www\./, ""); } catch {}
  }
  out.page_id = String(raw.pageHref ?? "").match(/facebook\.com\/([^/?#]+)/)?.[1] ?? "";
  out.media_type = raw.hasVideo ? "video" : (raw.imageCount ?? 0) >= 2 ? "carousel" : (raw.imageCount ?? 0) === 1 ? "image" : "";
  out.text_hash = hash(normText(out.page_name) + "|" + normText(out.body).slice(0, 300));
  return out;
}

// l.facebook.com/l.php?u=<encoded> → 실제 주소
function unwrapLink(href) {
  try { const u = new URL(href); if (/^l\.(facebook|instagram)\.com$/.test(u.hostname)) return u.searchParams.get("u") || href; } catch {}
  return href;
}

const addDays = (d, n) => { const t = new Date(d + "T00:00:00Z"); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const daysBetween = (a, b) => Math.round((new Date(b + "T00:00:00Z") - new Date(a + "T00:00:00Z")) / 864e5);

// 판정(추정): core 핵심 소재 / proven 검증됨 / new 테스트 중 / watch 지켜보기 / ended 종료
const PROVEN_DAYS = 14, CORE_DAYS = 30, CORE_ADS = 3, NEW_DAYS = 7;
function verdict(ad, today) {
  if (!ad.active) return "ended";
  const days = ad.start_date ? daysBetween(ad.start_date, today) : null;
  if ((days != null && days >= CORE_DAYS) || ad.multi_version || (ad.n_ads ?? 1) >= CORE_ADS) return "core";
  if (days != null && days >= PROVEN_DAYS) return "proven";
  if (ad.first_seen && daysBetween(ad.first_seen, today) <= NEW_DAYS && (days == null || days < PROVEN_DAYS)) return "new";
  return "watch";
}
const VERDICT_LABEL = { core: "🏆 핵심 소재", proven: "🟢 검증됨", new: "🆕 테스트 중", watch: "👀 지켜보기", ended: "⚫ 종료" };

// 오늘 못 본 광고의 종료 판정. 켜진 경쟁사 페이지는 전부 읽으므로 이틀 연속 안 보이면 종료.
// 키워드 검색으로만 본 광고는 검색 결과가 날마다 일부만 보여서(~1,000건 중 수십 건) 7일은 기다린다. 하루 수집 실패는 둘 다 봐준다.
const ENDED_GRACE_DAYS = 2, ENDED_GRACE_KEYWORD_DAYS = 7;
function endedIds(prevActive, seenIds, today) {
  const seen = new Set(seenIds);
  return prevActive.filter((a) => !seen.has(a.library_id) && daysBetween(a.last_seen, today) >= (a.competitor_id ? ENDED_GRACE_DAYS : ENDED_GRACE_KEYWORD_DAYS)).map((a) => a.library_id);
}

// 오늘 수집분 + 기존 행 → upsert 행 (first_seen·keywords 는 합친다)
function mergeRows(parsed, existing, { grp, today, keywordsById = {} }) {
  const prev = new Map((existing ?? []).map((e) => [e.library_id, e]));
  return parsed.map((p) => {
    const e = prev.get(p.library_id);
    const kw = [...new Set([...(e?.keywords ?? []), ...(keywordsById[p.library_id] ?? [])])];
    return { ...p, grp, first_seen: e?.first_seen ?? today, last_seen: today, active: true, ended_on: null, keywords: kw, thumb_path: e?.thumb_path ?? null, competitor_id: e?.competitor_id ?? null, updated_at: new Date().toISOString() };
  });
}

// 같은 페이지·같은 문구(text_hash) 묶기 → 광고주가 "미는" 소재
function groupByText(ads) {
  const m = new Map();
  for (const a of ads) { const k = `${a.page_name}|${a.text_hash}`; if (!m.has(k)) m.set(k, { key: k, page_name: a.page_name, text_hash: a.text_hash, ads: [] }); m.get(k).ads.push(a); }
  return [...m.values()].map((g) => ({ ...g, count: g.ads.length, start_date: g.ads.map((a) => a.start_date).filter(Boolean).sort()[0] ?? null }));
}

// ── 소재 추천 점검기 ──
// 경쟁사 문구 베끼기(문자 3-gram 자카드), 구 브랜드(컬컴) 언급, 과장·보장 표현을 경고로 낸다. 막는 건 컬컴뿐(save-report).
const grams = (s, n = 3) => { const t = normText(s); const g = new Set(); for (let i = 0; i + n <= t.length; i++) g.add(t.slice(i, i + n)); return g; };
function similarity(a, b) {
  const A = grams(a), B = grams(b); if (!A.size || !B.size) return 0;
  let inter = 0; for (const g of A) if (B.has(g)) inter++;
  return inter / (A.size + B.size - inter);
}
const COPY_SIMILAR = 0.35, COPY_SAME = 0.6;
const HYPE_RE = /(100\s*%|무조건|보장|1\s*위|최고|유일|완벽|확실히|반드시)/;
const idText = (idea) => [idea?.copy?.body, idea?.copy?.headline, idea?.copy?.description].filter(Boolean).join("\n");
function checkIdeas(ideas, competitorAds) {
  const out = [];
  (ideas ?? []).forEach((idea, i) => {
    const text = idText(idea), label = idea?.title ?? `추천 ${i + 1}`;
    // 컬컴은 우리가 내보내는 글(카피·훅·제목·제작 메모)에서만 막는다. why·refs 의 경쟁사 이름(컬컴 송도점 등)은 데이터.
    if (/컬컴|culcom/i.test([idea?.title, idea?.hook, idea?.production, text].join("\n"))) out.push({ idea: i, level: "block", msg: `${label}: 카피에 '컬컴/CULCOM' 이 들어 있어요 — 팔로로 바꿔 주세요` });
    if (!text) { out.push({ idea: i, level: "warn", msg: `${label}: 카피가 비어 있어요` }); return; }
    let best = { s: 0 };
    for (const ad of competitorAds ?? []) { const s = similarity(text, [ad.body, ad.headline].filter(Boolean).join("\n")); if (s > best.s) best = { s, ad }; }
    if (best.s >= COPY_SAME) out.push({ idea: i, level: "warn", msg: `${label}: ${best.ad.page_name} 광고 문구와 거의 같아요 (유사도 ${Math.round(best.s * 100)}%) — 구조만 가져오고 문장은 새로 쓰세요`, library_id: best.ad.library_id });
    else if (best.s >= COPY_SIMILAR) out.push({ idea: i, level: "info", msg: `${label}: ${best.ad.page_name} 광고와 비슷한 표현이 있어요 (유사도 ${Math.round(best.s * 100)}%)`, library_id: best.ad.library_id });
    const h = text.match(HYPE_RE); if (h) out.push({ idea: i, level: "warn", msg: `${label}: 과장·보장 표현 '${h[1]}' — 근거 없으면 빼세요` });
    if (/[0-9]+\s*(만\s*원|원|₩)/.test(text)) out.push({ idea: i, level: "info", msg: `${label}: 가격이 들어 있어요 — 지점별 가격 정책 확인` });
  });
  return out;
}

return { GROUPS, OWN_PAGE_RE, isOwnPage, groupOfTeamName, SEARCH_SETS, COUNTRY, searchUrl, isNumericPageId, pageUrl, competitorUrl, libraryUrl, PLATFORM_PATHS, platformOfPath, CTAS, DETAIL_BUTTONS,
  parseStartDate, cleanLines, hash, normText, parseCard, unwrapLink, addDays, daysBetween, PROVEN_DAYS, CORE_DAYS, CORE_ADS, NEW_DAYS, verdict, VERDICT_LABEL,
  ENDED_GRACE_DAYS, ENDED_GRACE_KEYWORD_DAYS, endedIds, mergeRows, groupByText, similarity, COPY_SIMILAR, COPY_SAME, checkIdeas };
});
