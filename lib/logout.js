// lib/logout.js など（場所は任意）
import { supabase } from "@/lib/supabaseClient";

export const logout = async () => {
  try {
    // ✅ freeDailyは保持
    const freeDailyDate = localStorage.getItem("freeDailyDate");
    const freeDailyCount = localStorage.getItem("freeDailyCount");

    // ✅ signOut（これが本体）
    const { error } = await supabase.auth.signOut();
    if (error) throw error;

    // ❌ localStorage.clear() はやめる（事故率高い）
    // localStorage.clear();

    // ✅ どうしても掃除したいなら「あなたのアプリ固有キーだけ」消す
    const keysToRemove = [
      "fromMyData",
      "startUnitFromMyData",
      "enteringQuestion",
      // 必要に応じて追加
    ];
    keysToRemove.forEach((k) => localStorage.removeItem(k));

    // ✅ freeDaily復元
    if (freeDailyDate) localStorage.setItem("freeDailyDate", freeDailyDate);
    if (freeDailyCount) localStorage.setItem("freeDailyCount", freeDailyCount);

    window.location.href = "/login";
  } catch (err) {
    console.error("ログアウト失敗:", err);
    alert("ログアウトに失敗しました");
  }
};
