import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

function normalizeQuestionId(value) {
  return value == null ? "" : String(value);
}

function buildQuestionTextMap(rows) {
  const map = new Map();
  for (const row of rows ?? []) {
    map.set(String(row.id), row.question ?? "");
  }
  return map;
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
    const limit = Math.min(Math.max(Number(req.query.limit ?? 20), 1), 50);

    // =========================================
    // 1) question_progress から優先度の高い問題を取得
    // =========================================
    const { data: progressRows, error: progressError } = await supabaseAdmin
      .from("question_progress")
      .select(
        `
          question_id,
          unit,
          understanding_score,
          retention_score,
          review_priority,
          status_label,
          last_answered_at,
          last_correct_at
        `,
      )
      .eq("user_id", userId)
      .gte("review_priority", 40)
      .order("review_priority", { ascending: false })
      .order("retention_score", { ascending: true })
      .limit(limit);

    if (progressError) {
      console.error(
        "[review-questions] question_progress query error:",
        progressError,
      );
      return res.status(500).json({ error: progressError.message });
    }

    if (progressRows && progressRows.length > 0) {
      const questionIds = progressRows
        .map((row) => normalizeQuestionId(row.question_id))
        .filter(Boolean);

      let questionTextMap = new Map();

      if (questionIds.length > 0) {
        const { data: questionRows, error: questionError } = await supabaseAdmin
          .from("questions")
          .select("id, question")
          .in("id", questionIds);

        if (questionError) {
          console.error(
            "[review-questions] questions lookup error:",
            questionError,
          );
        } else {
          questionTextMap = buildQuestionTextMap(questionRows);
        }
      }

      const questions = progressRows.map((row) => {
        const qid = normalizeQuestionId(row.question_id);

        return {
          question_id: qid,
          question_text: questionTextMap.get(qid) ?? "",
          unit: row.unit ?? "",
          understanding_score: row.understanding_score ?? 0,
          retention_score: row.retention_score ?? 0,
          review_priority: row.review_priority ?? 0,
          status_label: row.status_label ?? "要復習",
          last_answered_at: row.last_answered_at ?? null,
          last_correct_at: row.last_correct_at ?? null,
          source: "question_progress",
        };
      });

      return res.status(200).json({
        count: questions.length,
        questions,
      });
    }

    // =========================================
    // 2) フォールバック: study_logs ベース
    // =========================================
    const from = new Date();
    from.setDate(from.getDate() - 7);

    const { data: logRows, error: logError } = await supabaseAdmin
      .from("study_logs")
      .select("question_id, unit, is_correct, is_suspicious, created_at")
      .eq("user_id", userId)
      .gte("created_at", from.toISOString())
      .or("is_correct.eq.false,is_suspicious.eq.true")
      .order("created_at", { ascending: false });

    if (logError) {
      console.error(
        "[review-questions] fallback study_logs query error:",
        logError,
      );
      return res.status(500).json({ error: logError.message });
    }

    const seen = new Set();
    const unique = [];

    for (const row of logRows ?? []) {
      const key = normalizeQuestionId(row.question_id);
      if (!key || seen.has(key)) continue;
      seen.add(key);

      unique.push({
        question_id: key,
        question_text: "",
        unit: row.unit ?? "",
        understanding_score: null,
        retention_score: null,
        review_priority: 100,
        status_label: row.is_suspicious ? "怪しい正解" : "直近ミス",
        last_answered_at: row.created_at ?? null,
        last_correct_at: null,
        source: "study_logs_fallback",
      });

      if (unique.length >= limit) break;
    }

    const fallbackIds = unique.map((row) => row.question_id).filter(Boolean);

    if (fallbackIds.length > 0) {
      const { data: questionRows, error: fallbackQuestionError } =
        await supabaseAdmin
          .from("questions")
          .select("id, question")
          .in("id", fallbackIds);

      if (!fallbackQuestionError && questionRows) {
        const questionTextMap = buildQuestionTextMap(questionRows);
        for (const item of unique) {
          item.question_text = questionTextMap.get(item.question_id) ?? "";
        }
      }
    }

    return res.status(200).json({
      count: unique.length,
      questions: unique,
    });
  } catch (e) {
    console.error("[review-questions] handler error:", e);
    return res.status(500).json({ error: "Internal server error" });
  }
}
