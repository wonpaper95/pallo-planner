// 1분마다 pg_cron 이 부른다 → 알람 시각 된 태스크를 그 매니저의 폰·노트북으로 웹 푸시
import { createClient } from "npm:@supabase/supabase-js@2";
import * as webpush from "jsr:@negrel/webpush@0.5.0";
const db = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
async function setting(k) {
  const { data } = await db.from("app_settings").select("v").eq("k", k).single();
  return data?.v;
}
// 실제 남은 시간 (cron 이 1분 늦게 돌아도 정확하게)
function label(deadline) {
  const min = Math.round((new Date(deadline).getTime() - Date.now()) / 60000);
  if (min <= 0) return "지금 마감";
  if (min >= 1440) return `${Math.round(min / 1440)}일 후 마감`;
  if (min >= 60) return `${Math.floor(min / 60)}시간${min % 60 ? ` ${min % 60}분` : ""} 후 마감`;
  return `${min}분 후 마감`;
}
const DAY = [
  "일",
  "월",
  "화",
  "수",
  "목",
  "금",
  "토"
];
function kst(iso) {
  const d = new Date(new Date(iso).getTime() + 9 * 3600000); // 매니저는 모두 한국 시간
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}(${DAY[d.getUTCDay()]}) ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}
let server;
// 📷 고정업무 인증샷은 7일 뒤 자동 삭제 (하루 1번). 사진은 routine-photos/YYYY-MM-DD/ 폴더라 날짜 폴더째 지우고, 그 체크의 link 만 비움(체크 기록은 남음)
async function sweepPhotos() {
  const today = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10); // 한국 날짜
  if (await setting("photo_sweep_day") === today) return 0;
  const cutoff = new Date(new Date(today).getTime() - 7 * 86400000).toISOString().slice(0, 10); // 오늘-7 이하 폴더 삭제
  const bucket = db.storage.from("routine-photos");
  const { data: dirs, error } = await bucket.list("", {
    limit: 1000
  });
  if (error) throw error;
  let removed = 0;
  for (const d of dirs ?? []){
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.name) || d.name > cutoff) continue;
    const { data: files } = await bucket.list(d.name, {
      limit: 1000
    });
    const paths = (files ?? []).map((f)=>`${d.name}/${f.name}`);
    if (paths.length) {
      const { error: e } = await bucket.remove(paths);
      if (e) throw e;
      removed += paths.length;
    }
    const { error: e2 } = await db.from("team_routine_checks").update({
      link: null
    }).like("link", `%/routine-photos/${d.name}/%`);
    if (e2) throw e2;
  }
  await db.from("app_settings").upsert({
    k: "photo_sweep_day",
    v: today
  });
  return removed;
}
// ── 카카오 알림톡 (솔라피). 키는 Secrets(SOLAPI_API_KEY/SECRET), 채널·템플릿은 app_settings. 설정 없으면 조용히 건너뜀 ──
const SOLAPI = Deno.env.get("SOLAPI_BASE_URL") ?? "https://api.solapi.com";
async function solapiAuth(key, secret) {
  const date = new Date().toISOString(), salt = crypto.randomUUID().replaceAll("-", "");
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), {
    name: "HMAC",
    hash: "SHA-256"
  }, false, [
    "sign"
  ]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(date + salt)));
  return `HMAC-SHA256 apiKey=${key}, date=${date}, salt=${salt}, signature=${[
    ...sig
  ].map((b)=>b.toString(16).padStart(2, "0")).join("")}`;
}
async function sendKakao(list) {
  const key = Deno.env.get("SOLAPI_API_KEY"), secret = Deno.env.get("SOLAPI_API_SECRET");
  const [pfId, tAssign, tTeam, from] = await Promise.all([
    "kakao_pf_id",
    "kakao_tpl_assign",
    "kakao_tpl_team",
    "sms_from"
  ].map(setting));
  if (!list.length || !key || !secret || !pfId) return 0;
  const messages = list.flatMap((m)=>{
    const templateId = m.tpl === "assign" ? tAssign : tTeam;
    if (!templateId) return [];
    // 알림톡 실패 시 문자로 대신 (발신번호가 등록돼 있을 때만)
    return [
      {
        to: m.to,
        ...from ? {
          from
        } : {},
        kakaoOptions: {
          pfId,
          templateId,
          variables: m.vars,
          disableSms: !from
        }
      }
    ];
  });
  if (!messages.length) return 0;
  const res = await fetch(`${SOLAPI}/messages/v4/send-many/detail`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: await solapiAuth(key, secret)
    },
    body: JSON.stringify({
      messages
    })
  });
  const body = await res.json().catch(()=>({}));
  if (!res.ok || body.failedMessageList?.length) console.error("kakao", res.status, JSON.stringify(body).slice(0, 500));
  return messages.length - (body.failedMessageList?.length ?? 0);
}
const md = (d)=>d.slice(5).replace("-", "/");
// ── 📧 신고·제안 이메일 (Resend, Secrets: RESEND_API_KEY). 신고 하나에 메일 하나 → 자동 패치 작업이 이 메일을 읽음 ──
async function mailFeedback(list) {
  const key = Deno.env.get("RESEND_API_KEY"), to = Deno.env.get("FEEDBACK_EMAIL") ?? "dusdn2295@gmail.com";
  if (!key || !list.length) return 0;
  let n = 0;
  for (const f of list){
    const label = f.kind === "bug" ? "🐞 버그 신고" : "💡 개선 제안", who = `${f.who ?? "?"}${f.team ? `(${f.team})` : ""}`;
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: "팔로 플래너 <onboarding@resend.dev>",
        to: [
          to
        ],
        subject: `[팔로 플래너] ${label} #${f.id} · ${who}`,
        text: `${label} #${f.id}\n보낸 사람: ${who}\n시각: ${kst(f.created_at)}\n\n${f.body}\n\n— 플래너 열기: ${PLANNER}`
      })
    });
    if (r.ok) n++;
    else console.error("mail", r.status, (await r.text()).slice(0, 200));
  }
  return n;
}
// ── 💬 카카오톡 '나에게 보내기' (대표가 ⚙️에서 연결했을 때, planner-kakao 참고). 액세스 토큰은 6시간 → 지나면 갱신 ──
const KAUTH = Deno.env.get("KAKAO_AUTH_URL") ?? "https://kauth.kakao.com";
const KAPI = Deno.env.get("KAKAO_API_URL") ?? "https://kapi.kakao.com";
const PLANNER = Deno.env.get("PLANNER_URL") ?? "https://wonpaper95.github.io/pallo-planner/";
const KF = {
  me: [
    "refresh_token",
    "access_token",
    "access_expires"
  ],
  sender: [
    "sender_refresh",
    "sender_access",
    "sender_expires"
  ]
};
async function kakaoToken(l, who) {
  const [rf, ac, ex] = KF[who];
  if (l[ac] && l[ex] && new Date(l[ex]).getTime() > Date.now() + 60000) return l[ac];
  const f = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: Deno.env.get("KAKAO_REST_KEY") ?? "",
    refresh_token: l[rf] ?? ""
  });
  const sec = Deno.env.get("KAKAO_CLIENT_SECRET");
  if (sec) f.set("client_secret", sec);
  const r = await fetch(`${KAUTH}/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=utf-8"
    },
    body: f
  });
  const t = await r.json().catch(()=>({}));
  if (!r.ok) {
    if (t.error === "invalid_grant") await db.from("kakao_links").update({
      [rf]: null
    }).eq("user_id", l.user_id);
    throw new Error(`refresh ${who} ${r.status} ${t.error ?? ""}`);
  }
  const up = {
    [ac]: t.access_token,
    [ex]: new Date(Date.now() + t.expires_in * 1000).toISOString(),
    ...t.refresh_token ? {
      [rf]: t.refresh_token
    } : {}
  };
  await db.from("kakao_links").update(up).eq("user_id", l.user_id);
  Object.assign(l, up);
  return t.access_token;
}
async function kakaoSend(l, text) {
  const template_object = JSON.stringify({
    object_type: "text",
    text: text.slice(0, 200),
    link: {
      web_url: PLANNER,
      mobile_web_url: PLANNER
    },
    button_title: "플래너 열기"
  });
  const send = async (who, path, extra)=>{
    const r = await fetch(`${KAPI}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${await kakaoToken(l, who)}`,
        "Content-Type": "application/x-www-form-urlencoded;charset=utf-8"
      },
      body: new URLSearchParams({
        template_object,
        ...extra
      })
    });
    if (!r.ok) throw new Error(`${who} ${r.status} ${(await r.text()).slice(0, 200)}`);
  };
  if (l.sender_refresh && l.receiver_uuid) {
    try {
      return await send("sender", "/v1/api/talk/friends/message/default/send", {
        receiver_uuids: JSON.stringify([
          l.receiver_uuid
        ])
      });
    } catch (e) {
      console.error("kakao sender", String(e));
      if (!l.refresh_token) throw e;
    } // 안 되면 나에게 보내기로
  }
  await send("me", "/v2/api/talk/memo/default/send", {});
}
// VAPID 키쌍: 없으면 만들어 저장 (배포 후 첫 cron 1분 안에 생김). 동시에 두 번 돌아도 먼저 저장된 것 사용.
async function vapid() {
  if (!await setting("vapid_jwk")) {
    const keys = await webpush.generateVapidKeys({
      extractable: true
    });
    await db.from("app_settings").upsert([
      {
        k: "vapid_jwk",
        v: JSON.stringify(await webpush.exportVapidKeys(keys))
      },
      {
        k: "vapid_public",
        v: await webpush.exportApplicationServerKey(keys)
      }
    ], {
      onConflict: "k",
      ignoreDuplicates: true
    });
  }
  return webpush.importVapidKeys(JSON.parse(await setting("vapid_jwk")));
}
Deno.serve(async (req)=>{
  if (req.headers.get("x-cron-secret") !== await setting("cron_secret")) return new Response("no", {
    status: 401
  });
  const vapidKeys = await vapid();
  const { data: due, error } = await db.rpc("claim_due_alarms");
  if (error) return new Response(error.message, {
    status: 500
  });
  const { data: assigned } = await db.rpc("claim_new_assignments"); // 📨 대표가 새로 배정한 일
  const { data: teamNew } = await db.rpc("claim_new_team_tasks"); // 👥 새 팀 태스크 (팀원마다)
  const { data: rtDone } = await db.rpc("claim_routine_done"); // 🎉 지점 고정업무 다 끝남 → 대표
  const { data: fb } = await db.rpc("claim_new_feedback"); // 🐞 버그 신고·💡 개선 제안 → 대표
  const { data: tu } = await db.rpc("claim_timeups"); // ⏳ 해결목표 시간 끝 → 그 사람
  let swept = 0;
  try {
    swept = await sweepPhotos();
  } catch (e) {
    console.error("photo sweep", String(e));
  } // 📷 7일 지난 인증샷 정리 (하루 1번)
  const msgs = [
    ...(due ?? []).filter((t)=>t.deadline) // 마감 1시간 넘게 지난 건 보내지 않음
    .map((t)=>({
        user_id: t.user_id,
        title: `⏰ ${label(t.deadline)}`,
        body: `${t.title}\n${kst(t.deadline)}까지`,
        tag: `task-${t.id}`
      })),
    ...(assigned ?? []).map((t)=>({
        user_id: t.user_id,
        title: `📨 ${t.by_name ?? "대표"}님이 업무를 배정했어요`,
        body: `${t.title}\n${t.day.slice(5).replace("-", "/")}${t.deadline ? ` · ${kst(t.deadline)}까지` : ""}`,
        tag: `assign-${t.id}`
      })),
    ...(teamNew ?? []).map((t)=>({
        user_id: t.user_id,
        title: `👥 [${t.team}] 새 팀 업무`,
        body: `${t.title}\n${t.day.slice(5).replace("-", "/")}${t.deadline ? ` · ${kst(t.deadline)}까지` : ""}`,
        tag: `team-${t.title}-${t.day}`
      })),
    ...(rtDone ?? []).map((t)=>({
        user_id: t.user_id,
        title: `🎉 ${t.team} 오늘 고정업무 완료`,
        body: `${t.total}/${t.total} 모두 체크했어요${t.last_name ? ` · 마지막 ${t.last_name} ${kst(t.last_at).split(" ").at(-1)}` : ""}`,
        tag: `rtdone-${t.team}`
      })),
    ...(tu ?? []).map((t)=>({
        user_id: t.user_id,
        title: `⏰ 해결목표 ${t.estimate_min}분 끝!`,
        body: `${String(t.title).slice(0, 120)}\n끝냈으면 체크, 더 필요하면 +5분`,
        tag: `timeup-${t.id}`
      })),
    ...(fb ?? []).map((t, i)=>({
        user_id: t.user_id,
        title: `${t.kind === "bug" ? "🐞 버그 신고" : "💡 개선 제안"} · ${t.who ?? "?"}${t.team ? `(${t.team})` : ""}`,
        body: String(t.body).replace(/\s+/g, " ").slice(0, 150),
        tag: `fb-${Date.now()}-${i}`
      }))
  ];
  // 카톡: 배정·팀 업무를 받은 매니저 중 번호 있는 사람에게
  let kakao = 0;
  if ((assigned ?? []).length || (teamNew ?? []).length) {
    const ids = [
      ...new Set([
        ...assigned ?? [],
        ...teamNew ?? []
      ].map((t)=>t.user_id))
    ];
    const { data: ppl } = await db.from("profiles").select("user_id, name, phone").in("user_id", ids);
    const who = new Map((ppl ?? []).map((p)=>[
        p.user_id,
        p
      ]));
    const list = [
      ...(assigned ?? []).map((t)=>({
          t,
          tpl: "assign",
          extra: {
            "#{보낸사람}": t.by_name ?? "대표"
          }
        })),
      ...(teamNew ?? []).map((t)=>({
          t,
          tpl: "team",
          extra: {
            "#{팀}": t.team
          }
        }))
    ].flatMap(({ t, tpl, extra })=>{
      const p = who.get(t.user_id);
      if (!p?.phone) return [];
      return [
        {
          to: p.phone,
          tpl,
          vars: {
            "#{이름}": p.name,
            "#{업무}": t.title.slice(0, 200),
            "#{날짜}": md(t.day),
            "#{마감}": t.deadline ? kst(t.deadline) : "없음",
            ...extra
          }
        }
      ];
    });
    try {
      kakao = await sendKakao(list);
    } catch (e) {
      console.error("kakao", String(e));
    }
  }
  // 📧 신고는 대표가 여럿이어도 메일 한 통 (id 기준)
  let mailed = 0;
  try {
    mailed = await mailFeedback([
      ...new Map((fb ?? []).map((f)=>[
          f.id,
          f
        ])).values()
    ]);
  } catch (e) {
    console.error("mail", String(e));
  }
  if (!msgs.length) return Response.json({
    sent: 0,
    kakao,
    mailed,
    swept
  });
  // 💬 카톡 연결한 사람(대표)에겐 같은 알림을 카톡으로도 (업무폰 계정 → 1:1, 없으면 나와의 채팅)
  let kakaoMe = 0;
  const { data: links } = await db.from("kakao_links").select("user_id, refresh_token, access_token, access_expires, sender_refresh, sender_access, sender_expires, receiver_uuid").or("refresh_token.not.is.null,sender_refresh.not.is.null").in("user_id", [
    ...new Set(msgs.map((m)=>m.user_id))
  ]);
  for (const m of msgs){
    const l = (links ?? []).find((x)=>x.user_id === m.user_id);
    if (!l) continue;
    try {
      await kakaoSend(l, `${m.title}\n${m.body}`);
      kakaoMe++;
    } catch (e) {
      console.error("kakao send", String(e));
    }
  }
  server ??= await webpush.ApplicationServer.new({
    contactInformation: "mailto:dusdn2295@gmail.com",
    vapidKeys
  });
  const users = [
    ...new Set(msgs.map((m)=>m.user_id))
  ];
  const { data: subs } = await db.from("push_subs").select("endpoint, user_id, sub").in("user_id", users);
  let sent = 0;
  for (const m of msgs){
    const body = JSON.stringify({
      title: m.title,
      body: m.body,
      tag: m.tag
    });
    for (const s of (subs ?? []).filter((s)=>s.user_id === m.user_id)){
      try {
        await server.subscribe(s.sub).pushTextMessage(body, {
          urgency: webpush.Urgency.High,
          ttl: 3600
        });
        sent++;
      } catch (e) {
        if (e instanceof webpush.PushMessageError && e.isGone()) await db.from("push_subs").delete().eq("endpoint", s.endpoint);
        else console.error("push fail", s.endpoint.slice(0, 40), String(e));
      }
    }
  }
  return Response.json({
    sent,
    msgs: msgs.length,
    kakao,
    kakaoMe,
    mailed,
    swept
  });
});
