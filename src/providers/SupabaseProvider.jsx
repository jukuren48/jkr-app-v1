// src/providers/SupabaseProvider.jsx
import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

const SupabaseContext = createContext(null);

export function SupabaseContextProvider({ children }) {
  const [session, setSession] = useState(undefined); // 既存
  const [plan, setPlan] = useState("free"); // ★追加
  const [planLoading, setPlanLoading] = useState(true); // ★追加

  // ★追加：users_extended から plan を取得
  const fetchPlan = async (userId) => {
    try {
      setPlanLoading(true);

      const { data, error } = await supabase
        .from("users_extended")
        .select("plan")
        .eq("user_id", userId)
        .single();

      if (error) {
        console.warn("[plan] fetch error:", error);
        setPlan("free");
        return;
      }

      setPlan(data?.plan || "free");
    } catch (e) {
      console.warn("[plan] fetch exception:", e);
      setPlan("free");
    } finally {
      setPlanLoading(false);
    }
  };

  useEffect(() => {
    const loadSession = async () => {
      const { data } = await supabase.auth.getSession();
      const currentSession = data.session;

      setSession(currentSession);

      if (currentSession?.user) {
        // last_login 更新（既存）
        await supabase
          .from("users_extended")
          .update({ last_login: new Date().toISOString() })
          .eq("user_id", currentSession.user.id);

        // ★追加：plan 取得
        await fetchPlan(currentSession.user.id);
      } else {
        // 未ログイン
        setPlan("free");
        setPlanLoading(false);
      }
    };

    loadSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      setSession(newSession);

      if (newSession?.user) {
        // last_login 更新（既存）
        await supabase
          .from("users_extended")
          .update({ last_login: new Date().toISOString() })
          .eq("user_id", newSession.user.id);

        // ★追加：plan 取得
        await fetchPlan(newSession.user.id);
      }

      if (_event === "SIGNED_OUT") {
        setSession(null);
        setPlan("free"); // ★追加
        setPlanLoading(false); // ★追加
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <SupabaseContext.Provider value={{ supabase, session, plan, planLoading }}>
      {children}
    </SupabaseContext.Provider>
  );
}

export function useSupabase() {
  return useContext(SupabaseContext);
}
