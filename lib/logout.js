// lib/logout.js など（場所は任意）
import { supabase } from "@/lib/supabaseClient";

export const logout = async () => {
  try {
    // ✅ freeDaily 系だけ保持（あなたの仕様）
    const freeDailyDate = localStorage.getItem("freeDailyDate");
    const freeDailyCount = localStorage.getItem("freeDailyCount");

    // ✅ まず signOut（Provider が確実に反応する）
    const { error } = await supabase.auth.signOut();
    if (error) throw error;

    // ✅ 全消しはやめる（事故の元）
    // localStorage.clear();

    // 必要なら「あなたのアプリ固有キーだけ」消す（例）
    // localStorage.removeItem("fromMyData");
    // localStorage.removeItem("startUnitFromMyData");
    // localStorage.removeItem("enteringQuestion");
    // ...etc

    // ✅ freeDaily は復元
    if (freeDailyDate) localStorage.setItem("freeDailyDate", freeDailyDate);
    if (freeDailyCount) localStorage.setItem("freeDailyCount", freeDailyCount);

    window.location.href = "/login";
  } catch (err) {
    console.error("ログアウト失敗:", err);
    alert("ログアウトに失敗しました");
  }
};
