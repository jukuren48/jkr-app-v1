import { supabase } from "@/lib/supabaseClient";

export async function saveStudyLog({
  user_id,
  unit,
  question_id,
  is_correct,
  is_timeout,
  answer_time,
  did_review,
  is_suspicious,
}) {
  const { error } = await supabase.from("study_logs").insert([
    {
      user_id,
      unit,
      question_id,
      is_correct,
      is_timeout,
      answer_time,
      did_review,
      is_suspicious,
    },
  ]);

  if (error) {
    console.error("study_logs 保存エラー:", error);
  } else {
    console.log("study_logs 保存成功");
  }
}
