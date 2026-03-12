import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const authHeader = req.headers.authorization || "";
    const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

    if (!jwt) {
      return res.status(401).json({ error: "Missing access token" });
    }

    const { data: userData, error: userErr } =
      await supabaseAdmin.auth.getUser(jwt);

    if (userErr || !userData?.user?.id) {
      return res.status(401).json({ error: "Invalid token" });
    }

    const myUserId = userData.user.id;

    const from = new Date();
    from.setDate(from.getDate() - 7);

    // 直近7日ログ取得
    const { data: logs, error } = await supabaseAdmin
      .from("study_logs")
      .select("user_id")
      .gte("created_at", from.toISOString());

    if (error) {
      console.error("study_logs error:", error);
      return res.status(500).json({ error: error.message });
    }

    // 回答数集計
    const countMap = {};
    for (const row of logs ?? []) {
      countMap[row.user_id] = (countMap[row.user_id] || 0) + 1;
    }

    const ranking = Object.entries(countMap)
      .map(([user_id, total_answers]) => ({
        user_id,
        total_answers,
      }))
      .sort((a, b) => b.total_answers - a.total_answers);

    const ranked = ranking.map((r, index) => ({
      rank: index + 1,
      ...r,
    }));

    // 名前取得
    const userIds = ranked.map((r) => r.user_id);

    const { data: users } = await supabaseAdmin
      .from("users_extended")
      .select("user_id, display_name")
      .in("user_id", userIds);

    const nameMap = {};
    (users ?? []).forEach((u) => {
      nameMap[u.user_id] = u.display_name;
    });

    const rankedWithNames = ranked.map((r) => ({
      ...r,
      display_name: nameMap[r.user_id] || "匿名ユーザー",
    }));

    const top10 = rankedWithNames.slice(0, 10);

    const myRank = rankedWithNames.find((r) => r.user_id === myUserId) || null;

    return res.status(200).json({
      top10,
      myRank,
    });
  } catch (e) {
    console.error("weekly-ranking error:", e);
    return res.status(500).json({ error: "Internal server error" });
  }
}
