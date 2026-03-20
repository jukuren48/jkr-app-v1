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

function calcSmoothedRate(
  successes,
  attempts,
  priorRate = 0.6,
  priorWeight = 5,
) {
  const s = Number(successes ?? 0);
  const a = Number(attempts ?? 0);

  if (a <= 0) return priorRate * 100;

  return ((s + priorRate * priorWeight) / (a + priorWeight)) * 100;
}

function calcAttemptsWeight(attempts, maxWeight = 1) {
  const a = Number(attempts ?? 0);

  // 少ない回数では効きすぎず、増えるほど信頼度が上がる
  // 1問=0.18, 3問=0.39, 5問=0.55, 10問=0.78, 15問=0.90 くらい
  return Math.min(maxWeight, 1 - Math.exp(-a / 6));
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
  const totalAttempts = Math.max(0, toNumber(progressRow.total_attempts, 0));
  const totalCorrect = toNumber(progressRow.total_correct, 0);
  const firstTryCorrectCount = toNumber(progressRow.first_try_correct_count, 0);
  const hintUsedCount = toNumber(progressRow.hint_used_count, 0);
  const reviewCorrectCount = toNumber(progressRow.review_correct_count, 0);
  const suspiciousCount = toNumber(progressRow.suspicious_count, 0);
  const consecutiveCorrectCount = toNumber(
    progressRow.consecutive_correct_count,
    0,
  );

  // -----------------------------
  // 理解度
  // -----------------------------
  const correctRate = calcSmoothedRate(totalCorrect, totalAttempts, 0.58, 6);
  const firstTryRate = calcSmoothedRate(
    firstTryCorrectCount,
    totalAttempts,
    0.5,
    6,
  );

  const noHintSuccesses = Math.max(0, totalAttempts - hintUsedCount);
  const noHintRate = calcSmoothedRate(noHintSuccesses, totalAttempts, 0.7, 4);

  const reviewSuccessRate = calcSmoothedRate(
    reviewCorrectCount,
    totalAttempts,
    0.45,
    5,
  );

  const attemptsWeight = calcAttemptsWeight(totalAttempts);

  const rawUnderstanding =
    correctRate * 0.4 +
    firstTryRate * 0.25 +
    noHintRate * 0.2 +
    reviewSuccessRate * 0.15;

  let streakBonus = 0;
  if (consecutiveCorrectCount >= 5) streakBonus = 6;
  else if (consecutiveCorrectCount >= 3) streakBonus = 3;
  else if (consecutiveCorrectCount >= 2) streakBonus = 1.5;

  const suspiciousPenalty =
    suspiciousCount >= 5
      ? 8
      : suspiciousCount >= 3
        ? 5
        : suspiciousCount >= 1
          ? 2
          : 0;

  const understandingScore = clamp(
    58 * (1 - attemptsWeight) +
      (rawUnderstanding + streakBonus - suspiciousPenalty) * attemptsWeight,
  );

  // -----------------------------
  // 定着度
  // -----------------------------
  const daysSinceLastCorrect = getDaysSince(progressRow.last_correct_at);
  const retentionBase = calcRetentionBase(daysSinceLastCorrect);

  const retentionAttemptsWeight = calcAttemptsWeight(totalAttempts);

  let totalCorrectBonus = 0;
  if (totalCorrect >= 10) totalCorrectBonus = 12;
  else if (totalCorrect >= 7) totalCorrectBonus = 8;
  else if (totalCorrect >= 5) totalCorrectBonus = 5;
  else if (totalCorrect >= 3) totalCorrectBonus = 2;

  let stabilityBonus = 0;
  if (consecutiveCorrectCount >= 5) stabilityBonus = 10;
  else if (consecutiveCorrectCount >= 3) stabilityBonus = 6;
  else if (consecutiveCorrectCount >= 2) stabilityBonus = 3;

  const hintPenalty =
    hintUsedCount >= 5
      ? 10
      : hintUsedCount >= 3
        ? 6
        : hintUsedCount >= 1
          ? 3
          : 0;

  const retentionSuspiciousPenalty =
    suspiciousCount >= 5
      ? 8
      : suspiciousCount >= 3
        ? 5
        : suspiciousCount >= 1
          ? 2
          : 0;

  const rawRetention =
    retentionBase +
    totalCorrectBonus +
    stabilityBonus -
    hintPenalty -
    retentionSuspiciousPenalty;

  const retentionScore = clamp(
    55 * (1 - retentionAttemptsWeight) + rawRetention * retentionAttemptsWeight,
  );

  // -----------------------------
  // 復習優先度
  // -----------------------------
  const reviewPriority = clamp(
    (100 - understandingScore) * 0.4 + (100 - retentionScore) * 0.6,
  );

  // -----------------------------
  // 状態ラベル
  // -----------------------------
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
