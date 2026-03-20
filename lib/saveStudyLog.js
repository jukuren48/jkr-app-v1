import { supabase } from "@/lib/supabaseClient";

// ================================
// ヘルパー
// ================================
function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function getDaysSince(dateString) {
  if (!dateString) return null;
  const now = new Date();
  const past = new Date(dateString);
  const diffMs = now.getTime() - past.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

function calcRetentionBase(daysSinceLastCorrect) {
  if (daysSinceLastCorrect === null) return 0;
  if (daysSinceLastCorrect <= 0) return 100;
  if (daysSinceLastCorrect === 1) return 85;
  if (daysSinceLastCorrect === 2) return 75;
  if (daysSinceLastCorrect === 3) return 65;
  if (daysSinceLastCorrect <= 5) return 50;
  if (daysSinceLastCorrect <= 7) return 40;
  if (daysSinceLastCorrect <= 10) return 30;
  return 20;
}

function getStatusLabel(understanding, retention, priority) {
  if (priority >= 80) return "最優先復習";
  if (understanding >= 80 && retention >= 70) return "しっかり定着";
  if (understanding >= 70 && retention < 70) return "忘れかけ";
  if (understanding >= 40) return "まだ不安定";
  return "要理解";
}

function calcScores(progressRow) {
  const totalAttempts = Math.max(1, toNumber(progressRow.total_attempts, 0));
  const totalCorrect = toNumber(progressRow.total_correct, 0);
  const firstTryCorrectCount = toNumber(progressRow.first_try_correct_count, 0);
  const hintUsedCount = toNumber(progressRow.hint_used_count, 0);
  const reviewCorrectCount = toNumber(progressRow.review_correct_count, 0);
  const suspiciousCount = toNumber(progressRow.suspicious_count, 0);
  const consecutiveCorrectCount = toNumber(
    progressRow.consecutive_correct_count,
    0,
  );

  const correctRate = (totalCorrect / totalAttempts) * 100;
  const firstTryRate = (firstTryCorrectCount / totalAttempts) * 100;

  // ヒントを使っていない割合
  const noHintRate = ((totalAttempts - hintUsedCount) / totalAttempts) * 100;

  // 復習成功率（レビュー系の成功を少し評価）
  const reviewSuccessRate = clamp((reviewCorrectCount / totalAttempts) * 100);

  // 理解度
  const understandingScore = clamp(
    correctRate * 0.35 +
      firstTryRate * 0.3 +
      noHintRate * 0.2 +
      reviewSuccessRate * 0.15,
  );

  // 定着度
  const daysSinceLastCorrect = getDaysSince(progressRow.last_correct_at);
  const retentionBase = calcRetentionBase(daysSinceLastCorrect);

  let stabilityBonus = 0;
  if (consecutiveCorrectCount >= 5) stabilityBonus = 15;
  else if (consecutiveCorrectCount >= 3) stabilityBonus = 10;
  else if (consecutiveCorrectCount >= 2) stabilityBonus = 5;

  // ヒント依存と怪しい正解は少し減点
  const hintPenalty =
    hintUsedCount >= 5
      ? 15
      : hintUsedCount >= 3
        ? 10
        : hintUsedCount >= 1
          ? 5
          : 0;
  const suspiciousPenalty =
    suspiciousCount >= 5
      ? 12
      : suspiciousCount >= 3
        ? 8
        : suspiciousCount >= 1
          ? 4
          : 0;

  const retentionScore = clamp(
    retentionBase + stabilityBonus - hintPenalty - suspiciousPenalty,
  );

  // 復習優先度（高いほど今やるべき）
  const reviewPriority = clamp(
    (100 - understandingScore) * 0.45 + (100 - retentionScore) * 0.55,
  );

  const statusLabel = getStatusLabel(
    understandingScore,
    retentionScore,
    reviewPriority,
  );

  return {
    understanding_score: Number(understandingScore.toFixed(2)),
    retention_score: Number(retentionScore.toFixed(2)),
    review_priority: Number(reviewPriority.toFixed(2)),
    status_label: statusLabel,
  };
}

// ================================
// メイン
// ================================
export async function saveStudyLog(data) {
  const {
    user_id,
    question_id,
    unit = "",
    is_correct = false,
    is_timeout = false,
    answer_time = null,
    did_review = false,
    is_suspicious = false,

    // 将来拡張用（今は無くてもOK）
    used_hint = false,
    is_first_try = !did_review,
  } = data;

  // ----------------------------
  // 1) study_logs に履歴保存
  // ----------------------------
  const insertPayload = {
    user_id,
    question_id,
    unit,
    is_correct,
    is_timeout,
    answer_time,
    did_review,
    is_suspicious,
  };

  const { error: logError } = await supabase
    .from("study_logs")
    .insert([insertPayload]);

  if (logError) {
    console.error("❌ study_logs 保存エラー:", logError);
    console.log("📌 送信しようとしたデータ:", insertPayload);
    return { ok: false, error: logError };
  }

  // ----------------------------
  // 2) question_progress を取得
  // ----------------------------
  const { data: existing, error: fetchError } = await supabase
    .from("question_progress")
    .select("*")
    .eq("user_id", user_id)
    .eq("question_id", String(question_id))
    .maybeSingle();

  if (fetchError) {
    console.error("❌ question_progress 取得エラー:", fetchError);
    return { ok: false, error: fetchError };
  }

  const nowIso = new Date().toISOString();

  const current = existing ?? {
    user_id,
    question_id: String(question_id),
    unit,
    total_attempts: 0,
    total_correct: 0,
    first_try_correct_count: 0,
    hint_used_count: 0,
    review_correct_count: 0,
    suspicious_count: 0,
    timeout_count: 0,
    consecutive_correct_count: 0,
    last_answered_at: null,
    last_correct_at: null,
    understanding_score: 0,
    retention_score: 0,
    review_priority: 100,
    status_label: "要復習",
  };

  const next = {
    ...current,
    user_id,
    question_id: String(question_id),
    unit,
    total_attempts: toNumber(current.total_attempts) + 1,
    total_correct: toNumber(current.total_correct) + (is_correct ? 1 : 0),
    first_try_correct_count:
      toNumber(current.first_try_correct_count) +
      (is_first_try && is_correct ? 1 : 0),
    hint_used_count: toNumber(current.hint_used_count) + (used_hint ? 1 : 0),
    review_correct_count:
      toNumber(current.review_correct_count) +
      (did_review && is_correct ? 1 : 0),
    suspicious_count:
      toNumber(current.suspicious_count) + (is_suspicious ? 1 : 0),
    timeout_count: toNumber(current.timeout_count) + (is_timeout ? 1 : 0),
    consecutive_correct_count: is_correct
      ? toNumber(current.consecutive_correct_count) + 1
      : 0,
    last_answered_at: nowIso,
    last_correct_at: is_correct ? nowIso : current.last_correct_at,
  };

  const scoreFields = calcScores(next);

  const upsertPayload = {
    ...next,
    ...scoreFields,
  };

  const { error: upsertError } = await supabase
    .from("question_progress")
    .upsert([upsertPayload], {
      onConflict: "user_id,question_id",
    });

  if (upsertError) {
    console.error("❌ question_progress 更新エラー:", upsertError);
    console.log("📌 upsert payload:", upsertPayload);
    return { ok: false, error: upsertError };
  }

  console.log("✅ study_logs 保存 & question_progress 更新:", {
    unit,
    question_id,
    understanding: upsertPayload.understanding_score,
    retention: upsertPayload.retention_score,
    priority: upsertPayload.review_priority,
  });

  const beforeUnderstanding = Number(current.understanding_score ?? 0);
  const beforeRetention = Number(current.retention_score ?? 0);

  const afterUnderstanding = Number(upsertPayload.understanding_score ?? 0);
  const afterRetention = Number(upsertPayload.retention_score ?? 0);

  return {
    ok: true,
    progress: {
      question_id: upsertPayload.question_id,
      unit: upsertPayload.unit,
      understanding_score: upsertPayload.understanding_score,
      retention_score: upsertPayload.retention_score,
      review_priority: upsertPayload.review_priority,
      status_label: upsertPayload.status_label,
    },
    changes: {
      understanding_before: beforeUnderstanding,
      understanding_after: afterUnderstanding,
      understanding_improved: afterUnderstanding > beforeUnderstanding,

      retention_before: beforeRetention,
      retention_after: afterRetention,
      retention_improved: afterRetention > beforeRetention,
    },
  };
}
