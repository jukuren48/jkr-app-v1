// src/providers/SupabaseProvider.jsx
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

const SupabaseContext = createContext(null);

export function SupabaseContextProvider({ children }) {
  const [session, setSession] = useState(undefined);

  const [plan, setPlan] = useState("free");
  const [planLoading, setPlanLoading] = useState(true);

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
      // ★キャッシュ（10秒以内の再取得はスキップ）
      const now = Date.now();
      if (
        lastPlanFetchRef.current.userId === userId &&
        now - lastPlanFetchRef.current.at < 10_000
      ) {
        return; // finally で planLoading を戻す
      }
      lastPlanFetchRef.current = { userId, at: now };

      // ✅ maybeSingle：行が無いときに例外扱いにしにくい
      const { data, error } = await withTimeout(
        supabase
          .from("users_extended")
          .select("plan")
          .eq("user_id", userId)
          .maybeSingle(),
      );

      if (reqId !== planReqIdRef.current) return; // 古いリクエストは無視

      if (error) {
        console.warn("[plan] fetch error:", error);
        setPlan("free");
        return;
      }

      // 行が無い（data==null）場合は free 扱い
      setPlan(data?.plan || "free");
    } catch (e) {
      if (reqId !== planReqIdRef.current) return;
      console.warn("[plan] fetch exception:", e);
      setPlan("free");
    } finally {
      if (reqId === planReqIdRef.current) {
        setPlanLoading(false);
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
        // ただし planLoading が true のままになる事故防止
        setPlanLoading(false);
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
    <SupabaseContext.Provider value={{ supabase, session, plan, planLoading }}>
      {children}
    </SupabaseContext.Provider>
  );
}

export function useSupabase() {
  return useContext(SupabaseContext);
}
