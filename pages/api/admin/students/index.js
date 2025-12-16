// pages/api/admin/students.js
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // ① 生徒（users_extended）取得
  const { data: students, error } = await supabase
    .from("users_extended")
    .select("user_id, created_at, last_login")
    .eq("role", "student")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("users_extended error:", error);
    return res.status(500).json({ error: error.message });
  }

  // ② auth.users を Admin API で取得してマージ
  const results = [];

  for (const s of students) {
    const { data: user, error: userError } =
      await supabase.auth.admin.getUserById(s.user_id);

    if (userError) {
      console.warn("auth user fetch failed:", s.user_id);
      continue;
    }

    results.push({
      user_id: s.user_id,
      email: user.user.email,
      name:
        user.user.user_metadata?.name ||
        user.user.user_metadata?.full_name ||
        "未設定",
      last_login: s.last_login || user.user.last_sign_in_at,
      created_at: s.created_at,
    });

    // マージ後にソート（最新ログイン順）
    results.sort((a, b) => {
      if (!a.last_login && !b.last_login) return 0;
      if (!a.last_login) return 1;
      if (!b.last_login) return -1;
      return new Date(b.last_login) - new Date(a.last_login);
    });
  }

  return res.status(200).json(results);
}
