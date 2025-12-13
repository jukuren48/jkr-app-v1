import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // SELECT専用ならpublic keyでも動くが安全のためSRK
);

export default async function handler(req, res) {
  const { data, error } = await supabase
    .from("users_extended")
    .select("id, name, school, grade, role, created_at, last_login")
    .order("created_at", { ascending: true });

  if (error) {
    console.error(error);
    return res.status(500).json({ error: error.message });
  }

  return res.status(200).json({ students: data });
}
