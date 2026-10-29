// 사용: node scripts/mkd/naver-ad.mjs <YYYY-MM-DD> [--print]
// 네이버 검색광고 API: 캠페인 목록(GET /ncc/campaigns) + 그 날 통계(GET /stats) → 캠페인별 노출·클릭·비용(원, VAT 제외)·CTR·CPC·평균순위 를 mkd_daily(naver_ad) 에 저장.
// 계정 둘(대구: NAVER_AD_*, 울산: NAVER_AD_*_ULSAN — marketing.env 또는 MK_ENV). 울산 키가 셋 다 없으면 건너뛰고, 대구 키가 없으면 대구 지점들(dsr·jpcn)에 '네이버 키 없음' 실패 행을 쓴다.
// 한 계정이 실패해도 다른 계정은 계속하고, 실패한 계정의 지점에만 '전체' failed 행을 쓴 뒤 종료코드 1. --print 는 저장 없이 행만 출력.
// 키·시크릿·오류 본문은 출력하지 않는다 — 오류는 상태코드와 title 만, 4자리 이상 숫자는 #.
// 행 만들기(지점 매핑·PAUSED 거르기·같은 이름 합치기)는 naver-rows.mjs(순수, 테스트 있음).
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dateArg, run } from "../mk/db.mjs";
import { toRows, saveRows, teams } from "./lib.mjs";
import { ACCOUNTS, parseEnv, keyOutcome, campaignRows, failRows, apiErrorMessage, errorNote } from "./naver-rows.mjs";

const date = dateArg(2, "date"), print = process.argv.includes("--print");
const file = process.env.MK_ENV || `${homedir()}/.config/pallo/marketing.env`;
const env = parseEnv(readFileSync(file, "utf8"));
const BASE = "https://api.searchad.naver.com";

// 서명 = HMAC-SHA256(`${timestamp}.GET.${path}`) base64 (쿼리스트링은 서명에 넣지 않는다)
async function api(k, path, query = "") {
  const ts = String(Date.now()), sig = createHmac("sha256", k.secret).update(`${ts}.GET.${path}`).digest("base64");
  const r = await fetch(`${BASE}${path}${query}`, { headers: { "X-Timestamp": ts, "X-API-KEY": k.key, "X-Customer": k.cid, "X-Signature": sig }, signal: AbortSignal.timeout(30_000) });
  if (!r.ok) { // 본문 전체는 키를 되풀이할 수 있어 읽어도 title 만 쓴다 (가리고 나서 자르기: apiErrorMessage)
    let title = ""; try { const j = await r.json(); if (typeof j?.title === "string") title = j.title; } catch { /* 본문 없음 */ }
    throw new Error(apiErrorMessage(path, r.status, title, k));
  }
  return r.json();
}

// 한 계정 → { rows } | { skipped } ; 실패하면 { rows: 그 계정 지점들의 failed 행, failed: note }
async function collect(acct) {
  const o = keyOutcome(acct, env);
  if (o.action === "skip") return { skipped: true }; // 보조 계정(울산)은 키가 없으면 안 쓰는 것
  if (o.action === "fail") return { rows: failRows(acct, o.note), failed: o.note };
  const k = o.keys;
  try {
    const camps = await api(k, "/ncc/campaigns"), stats = [];
    if (Array.isArray(camps) && camps.length) {
      const ids = camps.map((c) => c.nccCampaignId);
      const fields = encodeURIComponent(JSON.stringify(["impCnt", "clkCnt", "salesAmt", "avgRnk"])), range = encodeURIComponent(JSON.stringify({ since: date, until: date }));
      for (let i = 0; i < ids.length; i += 50) {
        const res = await api(k, "/stats", `?ids=${ids.slice(i, i + 50).join(",")}&fields=${fields}&timeRange=${range}`);
        if (!Array.isArray(res?.data)) throw new Error("네이버 API /stats 응답에 data 배열이 없어요");
        stats.push(...res.data);
      }
    }
    return { rows: campaignRows(acct, camps, stats) };
  } catch (e) { const note = errorNote(e, k); return { rows: failRows(acct, note), failed: note }; }
}

await run(async () => {
  const rows = [], skipped = [], failed = [];
  for (const acct of ACCOUNTS) { // 계정마다 따로 — 하나가 실패해도 다음 계정은 한다
    const r = await collect(acct);
    if (r.skipped) { skipped.push(acct.name); continue; }
    rows.push(...r.rows);
    if (r.failed) failed.push(`${acct.name}: ${r.failed}`);
  }
  const out = await toRows("naver_ad", date, { rows }); // 한 번에 검증·저장해야 지점별 옛 실패 표시 정리가 맞다
  if (print) {
    const keyOf = new Map((await teams()).map((t) => [t.id, t.key]));
    console.log(JSON.stringify(out.map((r) => ({ team_key: keyOf.get(r.team_id), ...r })), null, 1));
    if (skipped.length) console.error(`건너뜀(키 없음): ${skipped.join(", ")}`);
  } else {
    const saved = await saveRows(out);
    console.log(JSON.stringify({ ok: !failed.length, date, saved, skipped, failed, campaigns: out.map((r) => `${r.team_id}:${r.unit}`) }));
  }
  if (failed.length) throw new Error(`네이버 광고 수집 실패 — ${failed.join(" / ")}`);
});
