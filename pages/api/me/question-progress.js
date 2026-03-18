import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

function normalizeQuestionId(value) {
  return value == null ? "" : String(value);
}

function normalizeUnit(value) {
  return String(value ?? "")
    .replace(/\u3000/g, " ") // 全角空白 → 半角
    .replace(/\s+/g, " ")
    .trim();
}

function buildQuestionMap(rows) {
  const map = new Map();
  for (const row of rows ?? []) {
    map.set(String(row.id), row);
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
    const rawUnit = String(req.query.unit ?? "");
    const unit = normalizeUnit(rawUnit);

    if (!unit) {
      return res.status(400).json({ error: "Missing unit" });
    }

    // =========================================
    // 1) まず question_progress を user 単位で全部取得し、
    //    JS側で unit を正規化比較する
    // =========================================
    const { data: allProgressRows, error: progressError } = await supabaseAdmin
      .from("question_progress")
      .select(
        `
        question_id,
        unit,
        total_attempts,
        total_correct,
        understanding_score,
        retention_score,
        review_priority,
        status_label,
        last_answered_at,
        last_correct_at
      `,
      )
      .eq("user_id", userId);

    if (progressError) {
      console.error("[question-progress] progress query error:", progressError);
      return res.status(500).json({ error: progressError.message });
    }

    const progressRows = (allProgressRows ?? []).filter(
      (row) => normalizeUnit(row.unit) === unit,
    );

    // デバッグ用
    console.log("[question-progress] request unit =", rawUnit);
    console.log("[question-progress] normalized unit =", unit);
    console.log(
      "[question-progress] matched progress rows =",
      progressRows.length,
    );

    // question_progress に一致があればそれを優先
    if (progressRows.length > 0) {
      const questionIds = progressRows
        .map((row) => normalizeQuestionId(row.question_id))
        .filter(Boolean);

      let questionMap = new Map();

      if (questionIds.length > 0) {
        const { data: questionRows, error: questionError } = await supabaseAdmin
          .from("questions")
          .select("id, question, choices, correct, explanation, level")
          .in("id", questionIds);

        if (questionError) {
          console.error(
            "[question-progress] questions lookup error:",
            questionError,
          );
        } else {
          questionMap = buildQuestionMap(questionRows);
        }
      }

      const rows = progressRows
        .map((row) => {
          const qid = normalizeQuestionId(row.question_id);
          const question = questionMap.get(qid);

          const accuracy =
            Number(row.total_attempts ?? 0) > 0
              ? (Number(row.total_correct ?? 0) /
                  Number(row.total_attempts ?? 0)) *
                100
              : 0;

          return {
            question_id: qid,
            unit: row.unit ?? "",
            question_text: question?.question ?? "",
            choices: question?.choices ?? [],
            correct: question?.correct ?? "",
            explanation: question?.explanation ?? "",
            level: question?.level ?? "",
            total_attempts: Number(row.total_attempts ?? 0),
            total_correct: Number(row.total_correct ?? 0),
            accuracy: Math.round(accuracy * 100) / 100,
            understanding_score: Number(row.understanding_score ?? 0),
            retention_score: Number(row.retention_score ?? 0),
            review_priority: Number(row.review_priority ?? 0),
            status_label: row.status_label ?? "要復習",
            last_answered_at: row.last_answered_at ?? null,
            last_correct_at: row.last_correct_at ?? null,
            source: "question_progress",
          };
        })
        .sort(
          (a, b) =>
            Number(b.review_priority ?? 0) - Number(a.review_priority ?? 0),
        );

      return res.status(200).json({
        unit,
        count: rows.length,
        questions: rows,
      });
    }

    // =========================================
    // 2) フォールバック: study_logs から単元内問題を集計
    // =========================================
    const { data: logRows, error: logError } = await supabaseAdmin
      .from("study_logs")
      .select(
        `
        question_id,
        unit,
        is_correct,
        created_at
      `,
      )
      .eq("user_id", userId);

    if (logError) {
      console.error("[question-progress] study_logs fallback error:", logError);
      return res.status(500).json({ error: logError.message });
    }

    const filteredLogs = (logRows ?? []).filter(
      (row) => normalizeUnit(row.unit) === unit,
    );

    console.log(
      "[question-progress] fallback study_logs matched =",
      filteredLogs.length,
    );

    if (filteredLogs.length === 0) {
      return res.status(200).json({
        unit,
        count: 0,
        questions: [],
      });
    }

    const grouped = new Map();

    for (const row of filteredLogs) {
      const qid = normalizeQuestionId(row.question_id);
      if (!qid) continue;

      if (!grouped.has(qid)) {
        grouped.set(qid, {
          question_id: qid,
          unit: row.unit ?? "",
          total_attempts: 0,
          total_correct: 0,
          last_answered_at: null,
        });
      }

      const item = grouped.get(qid);
      item.total_attempts += 1;
      if (row.is_correct) item.total_correct += 1;

      if (!item.last_answered_at) {
        item.last_answered_at = row.created_at ?? null;
      } else if (
        row.created_at &&
        new Date(row.created_at) > new Date(item.last_answered_at)
      ) {
        item.last_answered_at = row.created_at;
      }
    }

    const fallbackIds = Array.from(grouped.keys());

    let questionMap = new Map();

    if (fallbackIds.length > 0) {
      const { data: questionRows, error: questionError } = await supabaseAdmin
        .from("questions")
        .select("id, question, choices, correct, explanation, level")
        .in("id", fallbackIds);

      if (questionError) {
        console.error(
          "[question-progress] fallback questions lookup error:",
          questionError,
        );
      } else {
        questionMap = buildQuestionMap(questionRows);
      }
    }

    const rows = Array.from(grouped.values())
      .map((row) => {
        const question = questionMap.get(row.question_id);

        const accuracy =
          row.total_attempts > 0
            ? (row.total_correct / row.total_attempts) * 100
            : 0;

        return {
          question_id: row.question_id,
          unit: row.unit,
          question_text: question?.question ?? "",
          choices: question?.choices ?? [],
          correct: question?.correct ?? "",
          explanation: question?.explanation ?? "",
          level: question?.level ?? "",
          total_attempts: row.total_attempts,
          total_correct: row.total_correct,
          accuracy: Math.round(accuracy * 100) / 100,

          // フォールバック時は簡易表示
          understanding_score: Math.round(accuracy * 100) / 100,
          retention_score: 0,
          review_priority: 100 - Math.round(accuracy * 100) / 100,
          status_label: "履歴ベース",
          last_answered_at: row.last_answered_at ?? null,
          last_correct_at: null,
          source: "study_logs_fallback",
        };
      })
      .sort(
        (a, b) =>
          Number(b.review_priority ?? 0) - Number(a.review_priority ?? 0),
      );

    return res.status(200).json({
      unit,
      count: rows.length,
      questions: rows,
    });
  } catch (e) {
    console.error("[question-progress] handler error:", e);
    return res.status(500).json({ error: "Internal server error" });
  }
}
