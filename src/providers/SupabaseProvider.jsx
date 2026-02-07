// src/providers/SupabaseProvider.jsx
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

const SupabaseContext = createContext(null);

export function SupabaseContextProvider({ children }) {
  const [session, setSession] = useState(undefined);

  const [plan, setPlan] = useState("free");
  const [planLoading, setPlanLoading] = useState(true);
  const [planLoaded, setPlanLoaded] = useState(false);

  // 競合対策：最新リクエストのみ反映
  const planReqIdRef = useRef(0);
  const planLoadedRef = useRef(false);

  const fetchPlan = async (userId) => {
    const reqId = ++planReqIdRef.current;
    setPlanLoading(true);

    try {
      const { data, error } = await supabase
        .from("users_extended")
        .select("plan")
        .eq("user_id", userId)
        .maybeSingle();

      // 古いリクエストは無視
      if (reqId !== planReqIdRef.current) return;

      if (error) {
        console.warn("[plan] fetch error:", error);
        // 初回未確定のときだけ free を確定
        if (!planLoaded) setPlan("free");
        return;
      }

      setPlan(data?.plan || "free");
    } catch (e) {
      if (reqId !== planReqIdRef.current) return;
      console.warn("[plan] fetch exception:", e);
      if (!planLoaded) setPlan("free");
    } finally {
      if (reqId === planReqIdRef.current) {
        setPlanLoading(false);
        setPlanLoaded(true);
        planLoadedRef.current = true;
      }
    }
  };

  useEffect(() => {
    let isMounted = true;

    const loadSession = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!isMounted) return;

        const currentSession = data.session;
        setSession(currentSession);

        if (currentSession?.user?.id) {
          const userId = currentSession.user.id;

          // last_login 更新（失敗しても止めない）
          supabase
            .from("users_extended")
            .update({ last_login: new Date().toISOString() })
            .eq("user_id", userId)
            .then(() => {})
            .catch((e) =>
              console.warn("[users_extended] last_login update failed:", e),
            );

          // plan取得（初回）
          fetchPlan(userId);
        } else {
          setPlan("free");
          setPlanLoading(false);
          setPlanLoaded(true);
          planLoadedRef.current = true;
        }
      } catch (e) {
        console.warn("[session] loadSession failed:", e);
        if (!isMounted) return;
        setSession(null);
        setPlan("free");
        setPlanLoading(false);
        setPlanLoaded(true);
        planLoadedRef.current = true;
      }
    };

    loadSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      // ✅ SIGNED_OUT は最優先で即反映
      if (_event === "SIGNED_OUT") {
        setSession(null);
        setPlan("free");
        setPlanLoading(false);
        setPlanLoaded(true);
        return;
      }

      setSession(newSession);

      const userId = newSession?.user?.id;
      if (!userId) {
        setPlan("free");
        setPlanLoading(false);
        setPlanLoaded(true);
        return;
      }

      // TOKEN_REFRESHED は頻繁：plan未確定の時だけ取りに行く
      if (_event === "TOKEN_REFRESHED") {
        if (!planLoadedRef.current) fetchPlan(userId);
        else setPlanLoading(false);
        return;
      }

      // last_login 更新（待たない）
      supabase
        .from("users_extended")
        .update({ last_login: new Date().toISOString() })
        .eq("user_id", userId)
        .then(() => {})
        .catch((e) =>
          console.warn("[users_extended] last_login update failed:", e),
        );

      // plan取得（待たない）
      fetchPlan(userId);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []); // planLoaded を参照しているので依存に入れる（無限ループはしない）

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
