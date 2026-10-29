// 사용: node scripts/mka/push.mjs <planner_feed.json> [상태파일.json]
// 맥북 에이전트가 만든 planner_feed.json 을 mka_items 에 올리고(대표 승인 상태는 지킴), 대표가 화면에서 누른 킬스위치·승인·반려를 상태파일로 내려준다.
// 상태파일(기본: 피드 옆 planner_state.json)을 ad-agent 가 읽는다: kill=true 면 스레드 자동 게시를 멈추고, approved 는 번호 승인된 광고 제안.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { select, upsert, arg, run } from "../mk/db.mjs";
const C = createRequire(import.meta.url)("../../mka-core.js");

const feedFile = arg(2, "planner_feed.json");
const stateFile = process.argv[3] || join(dirname(feedFile), "planner_state.json");
await run(async () => {
  const feed = JSON.parse(readFileSync(feedFile, "utf8"));
  const existing = await select("mka_items", "select=kind,key,status&kind=eq.proposal", "key");
  const { withStatus, contentOnly } = C.splitFeed(feed.items ?? [], existing.map((r) => r.key));
  if (withStatus.length) await upsert("mka_items", withStatus, "kind,key");
  if (contentOnly.length) await upsert("mka_items", contentOnly, "kind,key");
  const rows = await select("mka_items", "select=kind,key,status&kind=in.(proposal,control)", "key");
  const state = { ...C.stateOf(rows), pulled_at: new Date().toISOString() };
  writeFileSync(stateFile, JSON.stringify(state, null, 1));
  console.log(JSON.stringify({ ok: true, pushed: withStatus.length + contentOnly.length, kill: state.kill, approved: state.approved.length, rejected: state.rejected.length }));
});
