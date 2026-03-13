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

    const userId = userData.user.id;

    // 念のため少し広めに取得
    const { data, error } = await supabaseAdmin
      .from("study_logs")
      .select("created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1000);

    if (error) {
      console.error("[streak] query error:", error);
      return res.status(500).json({ error: error.message });
    }

    const formatDateJST = (date) => {
      const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
      return jst.toISOString().slice(0, 10);
    };

    const today = new Date();
    const todayKey = formatDateJST(today);

    const uniqueDays = [
      ...new Set(
        (data ?? []).map((row) => {
          return formatDateJST(new Date(row.created_at));
        }),
      ),
    ];

    const daySet = new Set(uniqueDays);

    let streak = 0;
    let cursor = new Date();

    // 今日からさかのぼって連続判定
    while (true) {
      const key = formatDateJST(cursor);
      if (daySet.has(key)) {
        streak += 1;
        cursor.setDate(cursor.getDate() - 1);
      } else {
        break;
      }
    }

    const studiedToday = daySet.has(todayKey);

    return res.status(200).json({
      streak,
      studiedToday,
      studyDays: uniqueDays.length,
    });
  } catch (e) {
    console.error("[streak] handler error:", e);
    return res.status(500).json({ error: "Internal server error" });
  }
}
