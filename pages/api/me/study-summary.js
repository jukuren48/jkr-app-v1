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
    const { period = "all" } = req.query;

    let query = supabaseAdmin
      .from("study_log_summary")
      .select("unit, accuracy, last_study_at")
      .eq("user_id", userId);

    if (period !== "all") {
      const days = period === "7" ? 7 : 30;
      const from = new Date();
      from.setDate(from.getDate() - days);
      query = query.gte("last_study_at", from.toISOString());
    }

    const { data, error } = await query;

    if (error) {
      console.error("[study-summary] query error:", error);
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json(data ?? []);
  } catch (e) {
    console.error("[study-summary] handler error:", e);
    return res.status(500).json({ error: "Internal server error" });
  }
}
