import { supabase } from "./supabaseClient";

export const logout = async () => {
  try {
    await supabase.auth.signOut();
    localStorage.clear();
    window.location.href = "/login";
  } catch (err) {
    console.error("ログアウト失敗:", err);
    alert("ログアウトに失敗しました");
  }
};
