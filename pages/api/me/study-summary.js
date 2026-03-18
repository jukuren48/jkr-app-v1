import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

function round2(value) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

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

    // =========================================
    // 1) 新方式: question_progress ベース
    // =========================================
    const { data: progressRows, error: progressError } = await supabaseAdmin
      .from("question_progress")
      .select(
        `
          unit,
          total_attempts,
          total_correct,
          understanding_score,
          retention_score,
          review_priority,
          status_label,
          last_answered_at
        `,
      )
      .eq("user_id", userId);

    if (progressError) {
      console.error(
        "[study-summary] question_progress query error:",
        progressError,
      );
      return res.status(500).json({ error: progressError.message });
    }

    if (progressRows && progressRows.length > 0) {
      const byUnit = new Map();

      for (const row of progressRows) {
        const unit = row.unit ?? "未分類";

        if (!byUnit.has(unit)) {
          byUnit.set(unit, {
            unit,
            question_count: 0,
            total_attempts_sum: 0,
            total_correct_sum: 0,
            understanding_sum: 0,
            retention_sum: 0,
            priority_sum: 0,
            urgent_count: 0,
            last_study_at: null,
          });
        }

        const item = byUnit.get(unit);
        item.question_count += 1;
        item.total_attempts_sum += Number(row.total_attempts ?? 0);
        item.total_correct_sum += Number(row.total_correct ?? 0);
        item.understanding_sum += Number(row.understanding_score ?? 0);
        item.retention_sum += Number(row.retention_score ?? 0);
        item.priority_sum += Number(row.review_priority ?? 0);

        if ((row.review_priority ?? 0) >= 80) {
          item.urgent_count += 1;
        }

        if (!item.last_study_at) {
          item.last_study_at = row.last_answered_at ?? null;
        } else if (
          row.last_answered_at &&
          new Date(row.last_answered_at) > new Date(item.last_study_at)
        ) {
          item.last_study_at = row.last_answered_at;
        }
      }

      const summary = Array.from(byUnit.values()).map((item) => {
        const accuracy =
          item.total_attempts_sum > 0
            ? (item.total_correct_sum / item.total_attempts_sum) * 100
            : 0;

        const understanding_score =
          item.question_count > 0
            ? item.understanding_sum / item.question_count
            : 0;

        const retention_score =
          item.question_count > 0
            ? item.retention_sum / item.question_count
            : 0;

        const review_priority =
          item.question_count > 0 ? item.priority_sum / item.question_count : 0;

        return {
          unit: item.unit,

          // 既存互換
          accuracy: round2(accuracy),
          last_study_at: item.last_study_at,

          // 新規追加
          understanding_score: round2(understanding_score),
          retention_score: round2(retention_score),
          review_priority: round2(review_priority),
          question_count: item.question_count,
          urgent_count: item.urgent_count,
        };
      });

      // 復習優先度が高い単元を上にして返す
      summary.sort((a, b) => {
        if (b.review_priority !== a.review_priority) {
          return b.review_priority - a.review_priority;
        }
        return a.unit.localeCompare(b.unit, "ja");
      });

      return res.status(200).json(summary);
    }

    // =========================================
    // 2) フォールバック: 既存 study_log_summary
    // =========================================
    const { data: fallbackRows, error: fallbackError } = await supabaseAdmin
      .from("study_log_summary")
      .select("unit, accuracy, last_study_at")
      .eq("user_id", userId)
      .order("accuracy", { ascending: true });

    if (fallbackError) {
      console.error("[study-summary] fallback query error:", fallbackError);
      return res.status(500).json({ error: fallbackError.message });
    }

    const fallback = (fallbackRows ?? []).map((row) => ({
      unit: row.unit,
      accuracy: round2(row.accuracy),
      last_study_at: row.last_study_at,
      understanding_score: null,
      retention_score: null,
      review_priority: null,
      question_count: null,
      urgent_count: null,
    }));

    return res.status(200).json(fallback);
  } catch (e) {
    console.error("[study-summary] handler error:", e);
    return res.status(500).json({ error: "Internal server error" });
  }
}
