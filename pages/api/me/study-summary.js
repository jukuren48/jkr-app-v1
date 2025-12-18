import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { user_id, period = "all" } = req.query;

  if (!user_id) {
    return res.status(400).json({ error: "user_id is required" });
  }

  let query = supabase
    .from("study_log_summary")
    .select("unit, accuracy, last_study_at")
    .eq("user_id", user_id);

  if (period !== "all") {
    const days = period === "7" ? 7 : 30;
    const from = new Date();
    from.setDate(from.getDate() - days);
    query = query.gte("last_study_at", from.toISOString());
  }

  const { data, error } = await query;

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  return res.status(200).json(data ?? []);
}
