import { assertEquals } from "jsr:@std/assert@1";
import { editRatio, maskPII, route, type AskOut } from "./rules.ts";

const out = (o: Partial<AskOut>): AskOut => ({ grounded: true, decision_request: false, sensitive: false, answer: "네, 그렇게 하시면 돼요", refs: [3], reason: "", ...o });

Deno.test("route: 근거 있고 허락 요청 아니면 바로 답", () => {
  assertEquals(route(out({}), [3, 4]), { status: "ai", refs: [3] });
});
Deno.test("route: 허락·결정 요청은 근거 있어도 대표 대기", () => {
  assertEquals(route(out({ decision_request: true }), [3]).status, "waiting");
});
Deno.test("route: 근거 없음 → 대기", () => {
  assertEquals(route(out({ grounded: false }), [3]).status, "waiting");
});
Deno.test("route: 넘기지 않은 번호는 버리고, 남는 근거가 없으면 대기", () => {
  assertEquals(route(out({ refs: [99, 3, 3] }), [3]), { status: "ai", refs: [3] });
  assertEquals(route(out({ refs: [99] }), [3]), { status: "waiting", refs: [] });
});
Deno.test("route: 답이 비면 대기", () => {
  assertEquals(route(out({ answer: "  " }), [3]).status, "waiting");
});
Deno.test("maskPII: 전화번호·이메일·계좌", () => {
  assertEquals(maskPII("연락처 010-1234-5678 / 01098765432 / +82 10-2222-3333"), "연락처 010-****-**** / 010-****-**** / 010-****-****");
  assertEquals(maskPII("지점 053-123-4567 로"), "지점 0**-****-**** 로");
  assertEquals(maskPII("메일 kim.pallo@gmail.com 로"), "메일 ***@*** 로");
  assertEquals(maskPII("계좌 110-123-456789 입금"), "계좌 **** 입금");
});
Deno.test("maskPII: 날짜·시간·금액은 그대로", () => {
  const s = "2026-10-26 19:30 수업, 수강료 150,000원, 5개월 플랜";
  assertEquals(maskPII(s), s);
});
Deno.test("editRatio: 같으면 0, 전부 다르면 1, 공백 차이는 무시", () => {
  assertEquals(editRatio("안녕하세요", "안녕하세요"), 0);
  assertEquals(editRatio("가나", "다라"), 1);
  assertEquals(editRatio("네  알겠어요\n", "네 알겠어요"), 0);
  assertEquals(editRatio("", ""), 0);
});
Deno.test("editRatio: 조금 고치면 작은 값", () => {
  const r = editRatio("수업은 7시에 시작해요", "수업은 7시 반에 시작해요");
  if (!(r > 0 && r < 0.2)) throw new Error(`ratio ${r}`);
});
