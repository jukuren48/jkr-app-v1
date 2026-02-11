// pages/api/admin/upgrade-today.js
import { createClient } from "@supabase/supabase-js";

const ADMIN_EMAILS = ["info@juku-ren.jp"];

function calcStats(rows) {
  const counts = rows.reduce(
    (acc, r) => {
      if (r.event === "upgrade_modal_impression") acc.impressions++;
      if (r.event === "upgrade_click_checkout") acc.clicks++;
      if (r.event === "upgrade_click_close") acc.closes++;
      return acc;
    },
    { impressions: 0, clicks: 0, closes: 0 },
  );

  const cvr =
    counts.impressions > 0
      ? Math.round((counts.clicks / counts.impressions) * 1000) / 10
      : 0;

  return { ...counts, cvr };
}

export default async function handler(req, res) {
  try {
    // ① Bearer token を受け取る
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;

    if (!token) {
      return res.status(401).json({ error: "unauthorized (no token)" });
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !anonKey || !serviceKey) {
      return res.status(500).json({ error: "missing env" });
    }

    // ② token を検証して user を確定（anon clientでOK）
    const authClient = createClient(url, anonKey, {
      auth: { persistSession: false },
    });

    const { data: userData, error: userErr } =
      await authClient.auth.getUser(token);

    if (userErr || !userData?.user?.email) {
      return res.status(401).json({ error: "unauthorized (bad token)" });
    }

    const email = userData.user.email;
    if (!ADMIN_EMAILS.includes(email)) {
      return res.status(403).json({ error: "forbidden" });
    }

    // ③ Service Role で集計（RLSバイパス）
    const adminSupabase = createClient(url, serviceKey, {
      auth: { persistSession: false },
    });

    // ④ 今日/昨日/7日の起点（JST想定：サーバー環境がUTCでも動くように「日本時間」を固定するなら後で改善可）
    const now = new Date();
    const todayStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      0,
      0,
      0,
      0,
    );
    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setDate(todayStart.getDate() - 1);

    const sevenDaysStart = new Date(todayStart);
    sevenDaysStart.setDate(todayStart.getDate() - 6);

    // ⑤ 直近7日分を取得して振り分け
    const { data: rows, error } = await adminSupabase
      .from("upgrade_events")
      .select("event, created_at")
      .gte("created_at", sevenDaysStart.toISOString())
      .limit(200000);

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    const parsed = (rows || []).map((r) => ({
      ...r,
      _t: new Date(r.created_at).getTime(),
    }));

    const tToday = todayStart.getTime();
    const tYest = yesterdayStart.getTime();

    const todayRows = parsed.filter((r) => r._t >= tToday);
    const yesterdayRows = parsed.filter((r) => r._t >= tYest && r._t < tToday);

    return res.status(200).json({
      today: calcStats(todayRows),
      yesterday: calcStats(yesterdayRows),
      last7days: calcStats(parsed),
    });
  } catch (e) {
    return res.status(500).json({ error: String(e?.message ?? e) });
  }
}
