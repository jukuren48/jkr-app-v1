import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  const { id } = req.query;

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // users_extended
  const { data: ext, error: extError } = await supabase
    .from("users_extended")
    .select("user_id, created_at, last_login")
    .eq("user_id", id)
    .maybeSingle();

  if (extError || !ext) {
    return res.status(404).json({ error: "Student not found" });
  }

  // auth.users
  const { data: user, error: userError } =
    await supabase.auth.admin.getUserById(id);

  if (userError) {
    return res.status(500).json({ error: userError.message });
  }

  return res.status(200).json({
    user_id: id,
    email: user.user.email,
    name:
      user.user.user_metadata?.name ||
      user.user.user_metadata?.full_name ||
      "未設定",
    created_at: ext.created_at,
    last_login: ext.last_login || user.user.last_sign_in_at,
  });
}
