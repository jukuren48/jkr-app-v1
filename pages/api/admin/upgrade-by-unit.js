// pages/api/admin/upgrade-by-unit.js
import { createClient } from "@supabase/supabase-js";

const ADMIN_EMAILS = ["info@juku-ren.jp"];

function addCount(map, unit, event) {
  const key = unit && String(unit).trim() ? String(unit).trim() : "(不明)";
  if (!map[key]) map[key] = { unit: key, impressions: 0, clicks: 0, closes: 0 };

  if (event === "upgrade_modal_impression") map[key].impressions += 1;
  if (event === "upgrade_click_checkout") map[key].clicks += 1;
  if (event === "upgrade_click_close") map[key].closes += 1;
}

function finalize(map) {
  const arr = Object.values(map).map((r) => ({
    ...r,
    cvr:
      r.impressions > 0
        ? Math.round((r.clicks / r.impressions) * 1000) / 10
        : 0,
  }));

  // 表示数が多い順 → クリック順
  arr.sort((a, b) => b.impressions - a.impressions || b.clicks - a.clicks);
  return arr;
}

export default async function handler(req, res) {
  try {
    // ① Bearer token
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token)
      return res.status(401).json({ error: "unauthorized (no token)" });

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !anonKey || !serviceKey) {
      return res.status(500).json({ error: "missing env" });
    }

    // ② token検証（anon）
    const authClient = createClient(url, anonKey, {
      auth: { persistSession: false },
    });
    const { data: userData, error: userErr } =
      await authClient.auth.getUser(token);
    const email = userData?.user?.email ?? "";
    if (userErr || !email)
      return res.status(401).json({ error: "unauthorized (bad token)" });
    if (!ADMIN_EMAILS.includes(email))
      return res.status(403).json({ error: "forbidden" });

    // ③ Service Roleで集計
    const adminSupabase = createClient(url, serviceKey, {
      auth: { persistSession: false },
    });

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
    const sevenDaysStart = new Date(todayStart);
    sevenDaysStart.setDate(todayStart.getDate() - 6);

    // 直近7日分（unitも取る）
    const { data: rows, error } = await adminSupabase
      .from("upgrade_events")
      .select("event, created_at, unit")
      .gte("created_at", sevenDaysStart.toISOString())
      .limit(200000);

    if (error) return res.status(500).json({ error: error.message });

    const tToday = todayStart.getTime();

    const mapToday = {};
    const map7days = {};

    for (const r of rows || []) {
      // 7日
      addCount(map7days, r.unit, r.event);

      // 今日
      const t = new Date(r.created_at).getTime();
      if (t >= tToday) addCount(mapToday, r.unit, r.event);
    }

    return res.status(200).json({
      today: finalize(mapToday),
      last7days: finalize(map7days),
    });
  } catch (e) {
    return res.status(500).json({ error: String(e?.message ?? e) });
  }
}
