// 💬 Q&A 판정·가리기 규칙 (순수 함수). index.ts 가 쓰고 rules_test.ts 가 확인한다: deno test supabase/functions/qna/rules_test.ts
export type AskOut = { grounded: boolean; decision_request: boolean; sensitive: boolean; answer: string; refs: number[]; reason: string };

// 바로 답하는 조건: 확정 답변에 근거(실제로 넘긴 번호) + 허락·결정 요청 아님 + 답이 있음. 하나라도 빠지면 대표를 기다린다
export function route(out: AskOut, allowed: number[]): { status: "ai" | "waiting"; refs: number[] } {
  const ok = new Set(allowed);
  const refs = [...new Set((out.refs ?? []).filter((id) => ok.has(id)))];
  const direct = out.grounded === true && out.decision_request !== true && refs.length > 0 && String(out.answer ?? "").trim().length > 0;
  return { status: direct ? "ai" : "waiting", refs };
}

// 캡처에서 뽑은 글에 남은 개인정보를 한 번 더 가린다 (AI 가 1차로 가림). 날짜·시간·금액은 건드리지 않는다
export function maskPII(s: string): string {
  return String(s ?? "")
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "***@***")
    .replace(/(?<!\d)(\+82[-\s]?)?0?1[016789][-\s.]?\d{3,4}[-\s.]?\d{4}(?!\d)/g, "010-****-****")
    .replace(/(?<!\d)0[2-6]\d?-\d{3,4}-\d{4}(?!\d)/g, "0**-****-****")
    .replace(/(?<!\d)\d[\d-]{8,}\d(?!\d)/g, (m) => (m.replace(/-/g, "").length >= 10 ? "****" : m));
}

// 대표가 AI 초안을 얼마나 고쳤나 (0 = 그대로, 1 = 전부 새로). 공백 차이는 무시
export function editRatio(a: string, b: string): number {
  const x = [...String(a ?? "").replace(/\s+/g, " ").trim()], y = [...String(b ?? "").replace(/\s+/g, " ").trim()];
  if (!x.length && !y.length) return 0;
  let prev = Array.from({ length: y.length + 1 }, (_, j) => j);
  for (let i = 1; i <= x.length; i++) {
    const cur = [i];
    for (let j = 1; j <= y.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[y.length] / Math.max(x.length, y.length);
}
