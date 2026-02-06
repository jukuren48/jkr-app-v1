// src/providers/SupabaseProvider.jsx
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

const SupabaseContext = createContext(null);

export function SupabaseContextProvider({ children }) {
  const [session, setSession] = useState(undefined);

  const [plan, setPlan] = useState("free");
  const [planLoading, setPlanLoading] = useState(true);
  const [planLoaded, setPlanLoaded] = useState(false);

  // ★競合対策：最新リクエストIDだけが state 更新
  const planReqIdRef = useRef(0);

  // ★無駄fetch防止：同一ユーザーで短時間は再取得しない
  const lastPlanFetchRef = useRef({ userId: null, at: 0 });

  const withTimeout = (promise, ms = 5000) => {
    return Promise.race([
      promise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("plan fetch timeout")), ms),
      ),
    ]);
  };

  const fetchPlan = async (userId) => {
    const reqId = ++planReqIdRef.current;
    setPlanLoading(true);

    try {
      const { data, error } = await supabase
        .from("users_extended")
        .select("plan")
        .eq("user_id", userId)
        .maybeSingle();

      if (reqId !== planReqIdRef.current) return;

      if (error) {
        console.warn("[plan] fetch error:", error);
        // ★ここが重要：失敗しても plan を free に落とさない
        // 初回未確定なら free 扱いで確定させる
        if (!planLoaded) setPlan("free");
        return;
      }

      // 行が無いなら free 扱い
      setPlan(data?.plan || "free");
    } catch (e) {
      if (reqId !== planReqIdRef.current) return;
      console.warn("[plan] fetch exception:", e);
      // ★ここも同じ：失敗しても plan を落とさない
      if (!planLoaded) setPlan("free");
    } finally {
      if (reqId === planReqIdRef.current) {
        setPlanLoading(false);
        setPlanLoaded(true); // ★初回も含め確定
      }
    }
  };

  useEffect(() => {
    const loadSession = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const currentSession = data.session;

        setSession(currentSession);

        if (currentSession?.user) {
          // last_login 更新（既存）
          await supabase
            .from("users_extended")
            .update({ last_login: new Date().toISOString() })
            .eq("user_id", currentSession.user.id);

          await fetchPlan(currentSession.user.id);
        } else {
          setPlan("free");
          setPlanLoading(false);
        }
      } catch (e) {
        console.warn("[session] loadSession failed:", e);
        setSession(null);
        setPlan("free");
        setPlanLoading(false);
      }
    };

    loadSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      // SIGNED_OUT は最優先で落とす
      if (_event === "SIGNED_OUT") {
        setSession(null);
        setPlan("free");
        setPlanLoading(false);
        return;
      }
      setSession(newSession);

      // userがいない場合も free
      if (!newSession?.user?.id) {
        setPlan("free");
        setPlanLoading(false);
        return;
      }

      // ✅ ここが重要：頻繁に来るイベントで毎回fetchしない
      // TOKEN_REFRESHED は頻繁なので plan再取得は原則スキップ（必要ならここを調整）
      if (_event === "TOKEN_REFRESHED") {
        // 初回ロードが終わっていないなら plan を取りに行く
        if (!planLoaded) {
          await fetchPlan(newSession.user.id);
        } else {
          setPlanLoading(false);
        }
        return;
      }

      // last_login 更新（既存）
      try {
        await supabase
          .from("users_extended")
          .update({ last_login: new Date().toISOString() })
          .eq("user_id", newSession.user.id);
      } catch (e) {
        console.warn("[users_extended] last_login update failed:", e);
      }

      // plan取得
      await fetchPlan(newSession.user.id);
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <SupabaseContext.Provider
      value={{ supabase, session, plan, planLoading, planLoaded }}
    >
      {children}
    </SupabaseContext.Provider>
  );
}

export function useSupabase() {
  return useContext(SupabaseContext);
}
