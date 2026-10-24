// ✍️ 블로그 작성기 Edge Function. 화면(blog.js)이 sb.functions.invoke("blog-write", { body: { action, ... } }) 로 부른다.
// action: write(글 시안) | convert(인스타·당근·카톡) | style(블로그 URL → 스타일 프리셋) | keywords(네이버 검색광고 검색량) | similar(유사도)
// 비밀값: ANTHROPIC_API_KEY, NAVER_AD_CUSTOMER_ID, NAVER_AD_API_KEY, NAVER_AD_SECRET (supabase secrets set …)
import Anthropic from "npm:@anthropic-ai/sdk@0.137.0";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import {
  COMMON, CONCEPTS, CONVERT_SCHEMA, CONVERT_SYSTEM, POST_SCHEMA, PRESETS, READERS, STYLE_SCHEMA, STYLE_SYSTEM, TONES, WRITERS,
} from "./prompt.ts";

const MODEL = "claude-opus-5-5";
const PRICE = { in: 4 / 1e6, out: 20 / 1e6, cacheRead: 0.2 / 1e6, cacheWrite: 5 / 1e6 }; // USD / token
const AI_KINDS = ["write", "convert", "style"]; // 하루 제한에 세는 것
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
class HttpError extends Error { constructor(public status: number, msg: string) { super(msg); } }

const URL_ = Deno.env.get("SUPABASE_URL")!;
const admin = createClient(URL_, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const anthropic = new Anthropic(); // ANTHROPIC_API_KEY

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const body = await req.json();
    const who = await caller(req);
    const team = await teamFor(who, body.team_id);
    switch (body.action) {
      case "write": return json(await write(who, team, body));
      case "convert": return json(await convert(who, team, body));
      case "style": return json(await style(who, team, body));
      case "keywords": return json(await keywords(who, team, body));
      case "similar": return json(await similar(team, body));
      case "usage": return json(await usage(team));
      default: throw new HttpError(400, "알 수 없는 action");
    }
  } catch (e) {
    console.error(e);
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    if (e instanceof Anthropic.RateLimitError) return json({ error: "AI 요청이 몰렸어요. 1분 뒤 다시 눌러 주세요." }, 429);
    if (e instanceof Anthropic.APIError) return json({ error: `AI 오류 (${e.status ?? "연결"}): ${e.message}` }, 502);
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});

// ── 누가, 어느 지점 ──
type Who = { id: string; role: string; team: number | null };
async function caller(req: Request): Promise<Who> {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer /, "");
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, "로그인이 필요해요");
  const p = (await admin.from("profiles").select("role, team_id").eq("user_id", data.user.id).single()).data;
  return { id: data.user.id, role: p?.role ?? "manager", team: p?.team_id ?? null };
}
async function teamFor(who: Who, asked?: number) {
  const id = who.role === "admin" ? (asked ?? who.team) : who.team; // 매니저는 자기 지점만
  if (!id) throw new HttpError(400, "지점이 정해지지 않았어요");
  const [t, p] = await Promise.all([
    admin.from("teams").select("id, name").eq("id", id).single(),
    admin.from("blog_profiles").select("data").eq("team_id", id).maybeSingle(),
  ]);
  if (!t.data) throw new HttpError(404, "지점을 찾을 수 없어요");
  return { id: t.data.id as number, name: t.data.name as string, profile: (p.data?.data ?? {}) as Record<string, unknown> };
}
type Team = Awaited<ReturnType<typeof teamFor>>;

// ── 하루 제한·기록 ──
const kstMidnight = () => { const k = new Date(Date.now() + 9 * 3600e3); k.setUTCHours(0, 0, 0, 0); return new Date(k.getTime() - 9 * 3600e3).toISOString(); };
async function usedToday(team: number) {
  const { count } = await admin.from("blog_gens").select("id", { count: "exact", head: true })
    .eq("team_id", team).in("kind", AI_KINDS).gte("created_at", kstMidnight());
  const lim = (await admin.from("blog_limits").select("daily").eq("team_id", team).maybeSingle()).data?.daily ?? 10;
  return { used: count ?? 0, limit: lim };
}
async function guard(team: number) {
  const u = await usedToday(team);
  if (u.used >= u.limit) throw new HttpError(429, `오늘 생성 ${u.limit}회를 다 썼어요. 내일 다시 쓸 수 있어요 (대표님이 늘릴 수 있어요).`);
}
async function record(who: Who, team: number, kind: string, u?: Anthropic.Beta.BetaUsage) {
  const inT = u?.input_tokens ?? 0, outT = u?.output_tokens ?? 0;
  const cost = inT * PRICE.in + outT * PRICE.out + (u?.cache_read_input_tokens ?? 0) * PRICE.cacheRead + (u?.cache_creation_input_tokens ?? 0) * PRICE.cacheWrite;
  await admin.from("blog_gens").insert({ team_id: team, user_id: who.id, kind, input_tokens: inT, output_tokens: outT, cost_usd: cost.toFixed(5) });
  return usedToday(team);
}

// ── Claude 호출 (구조화 출력 + 거절 시 서버 측 대체 모델) ──
async function ask(system: Anthropic.Beta.BetaTextBlockParam[], content: Anthropic.Beta.BetaContentBlockParam[], schema: { [key: string]: unknown }, effort: "low" | "medium" | "high") {
  const msg = await anthropic.beta.messages.stream({
    model: MODEL,
    max_tokens: 32000,
    betas: ["server-side-fallback-2026-07-01"],
    // @ts-ignore 최신 SDK 타입에 없을 수 있음: 거절 카테고리에 맞춰 대체 모델로 다시 돌림
    fallbacks: "default",
    output_config: { effort, format: { type: "json_schema", schema } },
    system,
    messages: [{ role: "user", content }],
  }).finalMessage();
  if (msg.stop_reason === "refusal") throw new HttpError(422, "AI가 이 요청을 거절했어요. 사진이나 메모를 바꿔 다시 시도해 주세요.");
  if (msg.stop_reason === "max_tokens") throw new HttpError(502, "글이 너무 길어져 끊겼어요. 다시 눌러 주세요.");
  const text = msg.content.filter((b) => b.type === "text").map((b) => (b as Anthropic.Beta.BetaTextBlock).text).join("");
  try { return { out: JSON.parse(text), usage: msg.usage }; } catch { throw new HttpError(502, "AI 응답을 읽지 못했어요. 다시 눌러 주세요."); }
}
const sys = (...parts: string[]): Anthropic.Beta.BetaTextBlockParam[] =>
  parts.map((t, i) => ({ type: "text", text: t, ...(i === 0 ? { cache_control: { type: "ephemeral" } } : {}) }));

// ── write: 사진·옵션 → 시안 ──
type Photo = { data: string; media_type: string; note?: string };
async function write(who: Who, team: Team, b: { photos?: Photo[]; options?: Record<string, any> }) {
  await guard(team.id);
  const o = b.options ?? {}, photos = (b.photos ?? []).slice(0, 20);
  if (o.mode === "topic" && !String(o.topic ?? "").trim()) throw new HttpError(400, "주제를 적어 주세요");
  if (o.mode !== "topic" && !photos.length) throw new HttpError(400, "사진을 1장 이상 올려 주세요");

  let preset = PRESETS[o.preset] ?? PRESETS.checklist;
  if (String(o.preset).startsWith("custom:")) {
    const s = (await admin.from("blog_styles").select("name, rules").eq("id", +String(o.preset).slice(7)).maybeSingle()).data;
    if (s) preset = { name: s.name, rules: s.rules };
  }
  const recent = (await admin.from("blog_posts").select("title, body, created_at").eq("team_id", team.id).order("created_at", { ascending: false }).limit(8)).data ?? [];
  const p = team.profile as Record<string, any>;
  const lines = [
    `오늘: ${new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10)}`,
    `# 지점`, `지점명: ${p.display || team.name}`, `주소·위치: ${p.address || "[확인 필요]"} / ${p.location || ""}`,
    `과목: ${(p.subjects ?? []).join(", ")}`, `강점: ${p.strengths || ""}`, `운영시간: ${p.hours || "[확인 필요]"}`,
    `상담 방법: ${p.contact || "[확인 필요]"}`, `브랜드 태그: ${(p.brandTags ?? ["팔로"]).join(", ")}`, p.notes ? `지점 메모: ${p.notes}` : "",
    `# 이번 글`, `작성 방식: ${o.mode === "topic" ? "매니저가 준 주제로 작성 (사진은 보조)" : "사진을 보고 내용을 잡아 작성"}`,
    o.topic ? `주제/메모: ${o.topic}` : "", o.facts ? `확인된 사실(이것만 숫자·후기로 쓸 수 있음): ${o.facts}` : "확인된 사실: 없음 → 숫자·후기·일정은 [확인 필요]로",
    `과목: ${o.subject || "지점 과목 중 사진·주제에 맞는 것"}`,
    `스타일 프리셋: ${preset.name}`,
    `글쓴이(화자): ${WRITERS[o.writer] ?? WRITERS.director}${o.age ? `, ${o.age}` : ""}`,
    `타깃 독자: ${READERS[o.reader] ?? READERS.worker}${o.readerAge ? `, ${o.readerAge}` : ""}`,
    `어투: ${TONES[o.tone] ?? TONES.friendly}`, `컨셉: ${CONCEPTS[o.concept] ?? o.concept ?? CONCEPTS.class}`,
    `메인 키워드: ${o.main_keyword || "(지점 키워드 중 이 글에 가장 맞는 롱테일로 골라라)"}`,
    `서브 키워드 후보: ${(o.sub_keywords ?? []).join(", ") || (p.subKeywords ?? []).slice(0, 12).join(", ")}`,
    `사진: ${photos.length}장 (아래 순서가 사진 번호). ${photos.length ? "모든 사진을 한 번씩 photo 블록으로 배치하라. 순서는 글 흐름에 맞게 바꿔도 된다." : "사진이 없으니 photo 블록의 photo=0, text 에 찍으면 좋을 사진을 안내하라 (6~8개)."}`,
    recent.length ? `# 이 지점 최근 글 (겹치지 않게)\n${recent.map((r) => `- ${r.title} :: ${String(r.body).slice(0, 120).replace(/\s+/g, " ")}`).join("\n")}` : "",
  ].filter(Boolean).join("\n");

  const content: Anthropic.Beta.BetaContentBlockParam[] = [{ type: "text", text: lines }];
  photos.forEach((ph, i) => {
    content.push({ type: "text", text: `사진 ${i + 1}${ph.note ? ` (매니저 메모: ${ph.note})` : ""}` });
    content.push({ type: "image", source: { type: "base64", media_type: ph.media_type as "image/jpeg", data: ph.data } });
  });
  const { out, usage } = await ask(sys(COMMON, `# 스타일 프리셋: ${preset.name}\n${preset.rules}`), content, POST_SCHEMA, "medium");
  out.blocks = (out.blocks ?? []).map((x: any) => ({ ...x, photo: x.photo > 0 && x.photo <= photos.length ? x.photo : 0 }));
  return { post: out, quota: await record(who, team.id, "write", usage) };
}

// ── convert: 블로그 글 → 인스타·당근·카톡 ──
async function convert(who: Who, team: Team, b: { title?: string; body?: string }) {
  await guard(team.id);
  if (!b.body) throw new HttpError(400, "변환할 글이 없어요");
  const p = team.profile as Record<string, any>;
  const { out, usage } = await ask(sys(CONVERT_SYSTEM),
    [{ type: "text", text: `지점: ${p.display || team.name} (${p.location || p.address || ""})\n상담: ${p.contact || "[확인 필요]"}\n\n제목: ${b.title ?? ""}\n\n${b.body.slice(0, 12000)}` }],
    CONVERT_SCHEMA, "low");
  return { channels: out, quota: await record(who, team.id, "convert", usage) };
}

// ── style: 블로그 URL → 스타일 프리셋 저장 ──
async function style(who: Who, team: Team, b: { url?: string; text?: string; shared?: boolean }) {
  await guard(team.id);
  let src = String(b.text ?? "").trim(), photos = 0;
  if (!src && b.url) ({ text: src, photos } = await fetchNaverPost(b.url));
  if (src.length < 300) throw new HttpError(400, "글 내용을 충분히 읽지 못했어요. 글 본문을 복사해서 붙여 주세요.");
  const { out, usage } = await ask(sys(STYLE_SYSTEM),
    [{ type: "text", text: `사진 수(추정): ${photos}\n\n${src.slice(0, 15000)}` }], STYLE_SCHEMA, "medium");
  const row = (await admin.from("blog_styles").insert({
    team_id: b.shared && who.role === "admin" ? null : team.id, name: out.name, rules: out.rules, source_url: b.url ?? null, created_by: who.id,
  }).select("id, name, rules, team_id").single()).data;
  return { style: row, quota: await record(who, team.id, "style", usage) };
}
async function fetchNaverPost(url: string) {
  const m = url.match(/blog\.naver\.com\/([\w-]+)\/(\d+)/) ?? url.match(/blogId=([\w-]+).*?logNo=(\d+)/);
  if (!m) throw new HttpError(400, "네이버 블로그 글 주소가 아니에요 (blog.naver.com/아이디/글번호)");
  const r = await fetch(`https://m.blog.naver.com/${m[1]}/${m[2]}`, { headers: { "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)" } });
  if (!r.ok) throw new HttpError(502, `블로그를 열지 못했어요 (${r.status}). 본문을 복사해서 붙여 주세요.`);
  const html = await r.text(), i = html.indexOf("se-main-container");
  const part = i >= 0 ? html.slice(i) : html;
  const photos = (part.match(/se-image-resource|se-module-image/g) ?? []).length;
  const text = part.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, "")
    .replace(/<\/(p|div|span)>|<br\s*\/?>/g, "\n").replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .split("\n").map((l) => l.trim()).filter(Boolean).join("\n");
  return { text: text.slice(0, 20000), photos };
}

// ── keywords: 네이버 검색광고 키워드 도구 (월간 검색수·경쟁) ──
async function keywords(who: Who, team: Team, b: { hints?: string[] }) {
  const cid = Deno.env.get("NAVER_AD_CUSTOMER_ID"), key = Deno.env.get("NAVER_AD_API_KEY"), secret = Deno.env.get("NAVER_AD_SECRET");
  if (!cid || !key || !secret) throw new HttpError(503, "네이버 검색광고 키가 아직 연결되지 않았어요");
  const hints = [...new Set((b.hints ?? []).map((h) => h.replace(/\s+/g, "")).filter(Boolean))].slice(0, 5); // API: 공백 없이 최대 5개
  if (!hints.length) throw new HttpError(400, "키워드를 1개 이상 넣어 주세요");
  const ts = String(Date.now()), path = "/keywordstool";
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(`${ts}.GET.${path}`)))));
  const r = await fetch(`https://api.searchad.naver.com${path}?hintKeywords=${encodeURIComponent(hints.join(","))}&showDetail=1`, {
    headers: { "X-Timestamp": ts, "X-API-KEY": key, "X-Customer": cid, "X-Signature": sig },
  });
  if (!r.ok) throw new HttpError(502, `검색광고 API 오류 ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const n = (v: unknown) => typeof v === "number" ? v : 5; // "< 10" → 5로 봄
  const list = ((await r.json()).keywordList ?? []).map((x: any) => ({
    keyword: x.relKeyword, pc: n(x.monthlyPcQcCnt), mobile: n(x.monthlyMobileQcCnt), total: n(x.monthlyPcQcCnt) + n(x.monthlyMobileQcCnt), comp: x.compIdx,
  }));
  await record(who, team.id, "keywords");
  return { keywords: list.slice(0, 200) };
}

// ── similar: 전 지점 최근 글과 겹침 (3글자 조각 자카드) ──
const shingles = (s: string) => { const t = s.replace(/\s+/g, "").replace(/[^\p{L}\p{N}]/gu, ""), set = new Set<string>(); for (let i = 0; i + 3 <= t.length; i++) set.add(t.slice(i, i + 3)); return set; };
async function similar(team: Team, b: { text?: string; exclude_id?: number }) {
  const mine = shingles(String(b.text ?? ""));
  if (mine.size < 50) return { matches: [] };
  const [posts, teams] = await Promise.all([
    admin.from("blog_posts").select("id, team_id, title, body, created_at").order("created_at", { ascending: false }).limit(80),
    admin.from("teams").select("id, name"),
  ]);
  const tn = Object.fromEntries((teams.data ?? []).map((t) => [t.id, t.name]));
  const matches = (posts.data ?? []).filter((p) => p.id !== b.exclude_id).map((p) => {
    const o = shingles(p.body); let inter = 0; for (const x of mine) if (o.has(x)) inter++;
    return { id: p.id, title: p.title, team: tn[p.team_id] ?? "", same_team: p.team_id === team.id, date: p.created_at.slice(0, 10), score: Math.round(inter / (mine.size + o.size - inter || 1) * 100) };
  }).sort((a, c) => c.score - a.score).slice(0, 3);
  return { matches };
}

// ── usage: 오늘 남은 횟수 ──
async function usage(team: Team) { return { quota: await usedToday(team.id) }; }
