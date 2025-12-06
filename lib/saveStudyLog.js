import { supabase } from "./supabaseClient";

export async function saveStudyLog(data) {
  const { error } = await supabase.from("study_logs").insert([data]);

  if (error) {
    console.error("❌ study_logs 保存エラー:", error);
    console.log("📌 送信しようとしたデータ:", data);
  } else {
    console.log("保存OK:", data.unit);
  }
}
