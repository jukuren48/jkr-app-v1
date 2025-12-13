// src/providers/SupabaseProvider.jsx
import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

const SupabaseContext = createContext(null);

export function SupabaseContextProvider({ children }) {
  const [session, setSession] = useState(undefined); // ← そのまま

  useEffect(() => {
    // ★ 初回ロード時
    const loadSession = async () => {
      const { data } = await supabase.auth.getSession();
      const currentSession = data.session;

      setSession(currentSession);

      // ★ セッションがあれば最終ログイン更新
      if (currentSession?.user) {
        await supabase
          .from("users_extended")
          .update({
            last_login: new Date().toISOString(), // UTC保存でOK
          })
          .eq("id", currentSession.user.id);
      }
    };

    loadSession();

    // ★ 認証状態が変わった時（ログイン・ログアウト）
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);

      if (newSession?.user) {
        supabase
          .from("users_extended")
          .update({
            last_login: new Date().toISOString(),
          })
          .eq("id", newSession.user.id);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <SupabaseContext.Provider value={{ supabase, session }}>
      {children}
    </SupabaseContext.Provider>
  );
}

export function useSupabase() {
  return useContext(SupabaseContext);
}
