// 💬 매니저 Q&A Edge Function. 화면(qna.js)이 sb.functions.invoke("qna", { body: { action, ... } }) 로 부른다.
// action: ask(질문 → AI 바로 답 또는 대표 대기) | extract(카톡 캡처 → 질문·답 쌍, 대표만) | suggest(확정 전후 비교 → 말투 메모 제안, 대표만) | usage(오늘 사용량)
// 비밀값: ANTHROPIC_API_KEY (blog-write 와 같은 키). 설계: docs/manager-qna/README.md
import Anthropic from "npm:@anthropic-ai/sdk@0.137.0";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { ASK_SCHEMA, ASK_SYSTEM, EXTRACT_SCHEMA, EXTRACT_SYSTEM, SUGGEST_SCHEMA, SUGGEST_SYSTEM } from "./prompt.ts";
import { editRatio, maskPII, route, type AskOut } from "./rules.ts";

const MODEL = "claude-opus-5-5";
const PRICE = { in: 4 / 1e6, out: 20 / 1e6, cacheRead: 0.2 / 1e6, cacheWrite: 5 / 1e6 }; // USD / token
const DAILY = 50; // qna_limits 에 없을 때 지점당 하루 질문 수
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
class HttpError extends Error { constructor(public status: number, msg: string) { super(msg); } }

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
let client: Anthropic | null = null;
const anthropic = () => {
  if (!Deno.env.get("ANTHROPIC_API_KEY")) throw new HttpError(503, "AI 키(ANTHROPIC_API_KEY)가 아직 연결되지 않았어요");
  return (client ??= new Anthropic());
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const body = await req.json();
    const who = await caller(req);
    switch (body.action) {
      case "ask": return json(await ask(who, body));
      case "extract": return json(await extract(who, body));
      case "suggest": return json(await suggest(who, body));
      case "usage": return json(await usage(who));
      default: throw new HttpError(400, "알 수 없는 action");
    }
  } catch (e) {
    console.error(e);
    return json({ error: errText(e) }, e instanceof HttpError ? e.status : e instanceof Anthropic.RateLimitError ? 429 : e instanceof Anthropic.APIError ? 502 : 500);
  }
});
function errText(e: unknown) {
  if (e instanceof HttpError) return e.message;
  if (e instanceof Anthropic.RateLimitError) return "AI 요청이 몰렸어요. 1분 뒤 다시 눌러 주세요.";
  if (e instanceof Anthropic.APIError) return `AI 오류 (${e.status ?? "연결"}): ${e.message}`;
  return String((e as Error)?.message ?? e);
}

// ── 누가 ──
type Who = { id: string; role: string; team: number | null };
async function caller(req: Request): Promise<Who> {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer /, "");
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, "로그인이 필요해요");
  const p = (await admin.from("profiles").select("role, team_id").eq("user_id", data.user.id).single()).data;
  return { id: data.user.id, role: p?.role ?? "manager", team: p?.team_id ?? null };
}
const bossOnly = (who: Who) => { if (who.role !== "admin") throw new HttpError(403, "대표님만 쓸 수 있어요"); };

// ── 하루 한도·기록 (매니저 지점당 ask 만 셈, 대표는 제한 없음) ──
const kstMidnight = () => { const k = new Date(Date.now() + 9 * 3600e3); k.setUTCHours(0, 0, 0, 0); return new Date(k.getTime() - 9 * 3600e3).toISOString(); };
async function usage(who: Who) {
  if (!who.team) return { used: 0, limit: who.role === "admin" ? null : 0 };
  const { count } = await admin.from("qna_gens").select("id", { count: "exact", head: true })
    .eq("team_id", who.team).eq("kind", "ask").gte("created_at", kstMidnight());
  const lim = (await admin.from("qna_limits").select("daily").eq("team_id", who.team).maybeSingle()).data?.daily ?? DAILY;
  return { used: count ?? 0, limit: who.role === "admin" ? null : lim };
}
async function guard(who: Who) {
  if (who.role === "admin") return;
  const u = await usage(who);
  if (u.limit !== null && u.used >= u.limit) throw new HttpError(429, `오늘 AI 질문 ${u.limit}회를 다 썼어요`);
}
async function record(who: Who, kind: string, u?: Anthropic.Beta.BetaUsage, meta: Record<string, unknown> = {}) {
  const inT = u?.input_tokens ?? 0, outT = u?.output_tokens ?? 0;
  const cost = inT * PRICE.in + outT * PRICE.out + (u?.cache_read_input_tokens ?? 0) * PRICE.cacheRead + (u?.cache_creation_input_tokens ?? 0) * PRICE.cacheWrite;
  await admin.from("qna_gens").insert({ team_id: who.team, user_id: who.id, kind, input_tokens: inT, output_tokens: outT, cost_usd: cost.toFixed(5), meta });
}

// ── Claude 호출 (구조화 출력 + 거절 시 서버 측 대체 모델, blog-write 와 같음) ──
async function claude(system: Anthropic.Beta.BetaTextBlockParam[], content: Anthropic.Beta.BetaContentBlockParam[], schema: { [key: string]: unknown }, effort: "low" | "medium" | "high") {
  const msg = await anthropic().beta.messages.stream({
    model: MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    // @ts-ignore 최신 SDK 타입에 없을 수 있음: 거절 카테고리에 맞춰 대체 모델로 다시 돌림
    fallbacks: "default",
    output_config: { effort, format: { type: "json_schema", schema } },
    system,
    messages: [{ role: "user", content }],
  }).finalMessage();
  if (msg.stop_reason === "refusal") throw new HttpError(422, "AI가 이 요청을 거절했어요");
  if (msg.stop_reason === "max_tokens") throw new HttpError(502, "AI 답이 너무 길어져 끊겼어요. 다시 눌러 주세요.");
  const text = msg.content.filter((b) => b.type === "text").map((b) => (b as Anthropic.Beta.BetaTextBlock).text).join("");
  try { return { out: JSON.parse(text), usage: msg.usage }; } catch { throw new HttpError(502, "AI 응답을 읽지 못했어요. 다시 눌러 주세요."); }
}
// 고정 규칙 → 메모 → 예시 순서. 마지막 블록에 캐시 표시 (예시가 안 바뀌는 동안 재사용)
const sys = (...parts: string[]): Anthropic.Beta.BetaTextBlockParam[] =>
  parts.map((t, i) => ({ type: "text", text: t, ...(i === parts.length - 1 ? { cache_control: { type: "ephemeral" } } : {}) }));
const memoOf = async () => String((await admin.from("qna_style").select("memo").eq("id", 1).maybeSingle()).data?.memo ?? "").trim();

// ── ask: 먼저 '대기'로 저장(AI 가 실패해도 질문은 남게) → AI 판단 → 바로 답 또는 대표 대기 ──
const ITEM = "*";
async function ask(who: Who, b: { question?: string; private?: boolean }) {
  const question = String(b.question ?? "").trim();
  if (question.length < 2) throw new HttpError(400, "질문을 적어 주세요");
  if (question.length > 2000) throw new HttpError(400, "질문은 2000자까지 돼요");
  if (who.role !== "admin" && !who.team) throw new HttpError(400, "지점이 정해지지 않았어요");
  const { data: row, error } = await admin.from("qna_items")
    .insert({ user_id: who.id, team_id: who.team, question, private: !!b.private, status: "waiting" }).select("id").single();
  if (error) throw error;
  let patch: Record<string, unknown>;
  try {
    await guard(who);
    const [refs, memo] = await Promise.all([
      admin.rpc("qna_pick_refs", { q: question, team: who.team, n: 40 }).then((r) => { if (r.error) throw r.error; return (r.data ?? []) as { id: number; question: string; answer: string }[]; }),
      memoOf(),
    ]);
    const refsText = refs.length
      ? `# 확정 답변 (${refs.length}개)\n` + refs.map((r) => `#${r.id}\nQ: ${r.question}\nA: ${r.answer}`).join("\n\n")
      : "# 확정 답변\n(아직 없음 → grounded=false)";
    const { out, usage: u } = await claude(sys(ASK_SYSTEM, `# 대표 말투·원칙 메모\n${memo || "(비어 있음)"}`, refsText),
      [{ type: "text", text: `# 매니저 질문\n${question}` }], ASK_SCHEMA, "medium");
    await record(who, "ask", u);
    const o = out as AskOut, r = route(o, refs.map((x) => x.id));
    patch = {
      status: r.status, refs: r.refs, ai_answer: o.answer, answer: r.status === "ai" ? o.answer : "",
      ai_flags: { grounded: o.grounded, decision_request: o.decision_request, sensitive: o.sensitive, reason: o.reason },
      notified_wait: r.status !== "waiting",
      ...(o.sensitive ? { private: true, auto_private: !b.private } : {}),
    };
  } catch (e) {
    console.error("ask ai", e);
    patch = { ai_flags: { reason: errText(e), failed: true }, notified_wait: false };
  }
  const { data: item, error: e2 } = await admin.from("qna_items").update(patch).eq("id", row.id).select(ITEM).single();
  if (e2) throw e2;
  return { item };
}

// ── extract: 카톡 캡처 → 질문·답 쌍 (Task 7) ──
async function extract(who: Who, _b: unknown): Promise<unknown> { bossOnly(who); throw new HttpError(501, "캡처 학습은 다음 단계에서 붙여요"); }
// ── suggest: 대표가 고친 답 → 말투 메모 제안 (Task 8) ──
async function suggest(who: Who, _b: unknown): Promise<unknown> { bossOnly(who); throw new HttpError(501, "말투 제안은 다음 단계에서 붙여요"); }
