import { supabase } from "./supabaseClient";

export const logout = async () => {
  try {
    // ✅ freeDaily 系は保持
    const freeDailyDate = localStorage.getItem("freeDailyDate");
    const freeDailyCount = localStorage.getItem("freeDailyCount");

    await supabase.auth.signOut();

    // 一旦クリア
    localStorage.clear();

    // ✅ 無料体験の制限だけ復元
    if (freeDailyDate) {
      localStorage.setItem("freeDailyDate", freeDailyDate);
    }
    if (freeDailyCount) {
      localStorage.setItem("freeDailyCount", freeDailyCount);
    }

    window.location.href = "/login";
  } catch (err) {
    console.error("ログアウト失敗:", err);
    alert("ログアウトに失敗しました");
  }
};
