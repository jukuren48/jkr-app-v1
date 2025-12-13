// pages/api/admin/questions.js

import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  // GET 以外は拒否（まずは一覧取得のみ）
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  // Supabase クライアント
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  // データを取得
  const { data, error } = await supabase
    .from("questions")
    .select("*")
    .order("unit", { ascending: true });

  if (error) {
    console.error("❌ Supabase 取得エラー:", error);
    return res.status(500).json({ error: "Failed to fetch questions." });
  }

  return res.status(200).json(data);
}
