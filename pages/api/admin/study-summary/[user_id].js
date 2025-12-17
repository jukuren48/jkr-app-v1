import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  const { user_id } = req.query;

  // GET 以外は拒否
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!user_id) {
    return res.status(400).json({ error: "user_id is required" });
  }

  const { data, error } = await supabase
    .from("study_log_summary")
    .select(
      `
      unit,
      study_date,
      total_count,
      correct_count,
      accuracy,
      total_answer_time,
      last_study_at
      `
    )
    .eq("user_id", user_id)
    .order("last_study_at", { ascending: false });

  if (error) {
    console.error("study summary api error:", error);
    return res.status(500).json({ error: error.message });
  }

  return res.status(200).json(data);
}
