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

    const from = new Date();
    from.setDate(from.getDate() - 7);

    const { data, error } = await supabaseAdmin
      .from("study_logs")
      .select("question_id, unit, is_correct, is_suspicious, created_at")
      .eq("user_id", userId)
      .gte("created_at", from.toISOString())
      .or("is_correct.eq.false,is_suspicious.eq.true")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[review-questions] query error:", error);
      return res.status(500).json({ error: error.message });
    }

    const seen = new Set();
    const unique = [];

    for (const row of data ?? []) {
      const key = String(row.question_id);
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(row);
    }

    return res.status(200).json({
      count: unique.length,
      questions: unique,
    });
  } catch (e) {
    console.error("[review-questions] handler error:", e);
    return res.status(500).json({ error: "Internal server error" });
  }
}
