// 사용: node scripts/mk/teams.mjs → 지점 [{id,name}] (정렬 순). 읽기 전용.
import { select, run } from "./db.mjs";
await run(async () => {
  console.log(JSON.stringify((await select("teams", "select=id,name", "sort,id")).map(({ id, name }) => ({ id, name }))));
});
