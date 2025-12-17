import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function getGrade(accuracy) {
  if (accuracy === null || accuracy === undefined) return "";
  if (accuracy >= 80) return "◎";
  if (accuracy >= 65) return "○";
  if (accuracy >= 50) return "△";
  return "×";
}

export default async function handler(req, res) {
  const { user_id } = req.query;
  const { period = "all", weak = "0" } = req.query; // ★ 追加

  if (req.method !== "GET") {
    return res.status(405).end();
  }

  // 取得
  let query = supabase
    .from("study_log_summary")
    .select(
      `
      unit,
      accuracy,
      total_count,
      correct_count,
      total_answer_time,
      last_study_at
    `
    )
    .eq("user_id", user_id);

  // ★ 期間フィルタ
  if (period !== "all") {
    const days = period === "7" ? 7 : 30;
    const from = new Date();
    from.setDate(from.getDate() - days);
    query = query.gte("last_study_at", from.toISOString());
  }

  // ★ 弱点のみ
  if (weak === "1") {
    query = query.lt("accuracy", 50);
  }

  const { data, error } = await query.order("accuracy", { ascending: true });

  if (error) {
    console.error(error);
    return res.status(500).json({ error: error.message });
  }

  // CSV生成（BOM付き）
  const header = [
    "単元",
    "正答率（%）",
    "評価",
    "問題数",
    "正解数",
    "学習時間（分）",
    "最終学習日",
  ];

  const rows = data.map((r) => [
    r.unit,
    r.accuracy ?? "",
    getGrade(r.accuracy),
    r.total_count,
    r.correct_count,
    r.total_answer_time ? Math.round(r.total_answer_time / 60) : "",
    r.last_study_at
      ? new Date(r.last_study_at).toLocaleString("ja-JP", {
          timeZone: "Asia/Tokyo",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "",
  ]);

  const csvBody = [header, ...rows]
    .map((row) =>
      row.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")
    )
    .join("\n");

  const csv = "\ufeff" + csvBody;

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="study_log_${user_id}.csv"`
  );

  return res.status(200).send(csv);
}
