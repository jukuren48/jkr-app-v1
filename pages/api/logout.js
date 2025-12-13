// pages/api/logout.js
import { createPagesServerClient } from "@supabase/auth-helpers-nextjs";

export default async function handler(req, res) {
  const supabase = createPagesServerClient({ req, res });

  await supabase.auth.signOut();

  return res.redirect("/login");
}
