// src/providers/SupabaseProvider.jsx
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

const SupabaseContext = createContext(null);

export function SupabaseContextProvider({ children }) {
  const [session, setSession] = useState(undefined);

  const [plan, setPlan] = useState("free");
  const [subscriptionStatus, setSubscriptionStatus] = useState(null);
  const [cancelAtPeriodEnd, setCancelAtPeriodEnd] = useState(false);
  const [currentPeriodEnd, setCurrentPeriodEnd] = useState(null);

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
        .select(
          "plan, subscription_status, cancel_at_period_end, current_period_end",
        )
        .eq("user_id", userId)
        .maybeSingle();

      if (reqId !== planReqIdRef.current) return;

      if (error) {
        console.warn("[plan] fetch error:", error);

        if (!planLoadedRef.current) {
          setPlan("free");
          setSubscriptionStatus(null);
          setCancelAtPeriodEnd(false);
          setCurrentPeriodEnd(null);
        }
        return;
      }

      setPlan(data?.plan || "free");
      setSubscriptionStatus(data?.subscription_status || null);
      setCancelAtPeriodEnd(!!data?.cancel_at_period_end);
      setCurrentPeriodEnd(data?.current_period_end || null);
    } catch (e) {
      if (reqId !== planReqIdRef.current) return;
      console.warn("[plan] fetch exception:", e);

      if (!planLoadedRef.current) {
        setPlan("free");
        setSubscriptionStatus(null);
        setCancelAtPeriodEnd(false);
        setCurrentPeriodEnd(null);
      }
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

          supabase
            .from("users_extended")
            .update({ last_login: new Date().toISOString() })
            .eq("user_id", userId)
            .then(() => {})
            .catch((e) =>
              console.warn("[users_extended] last_login update failed:", e),
            );

          fetchPlan(userId);
        } else {
          setPlan("free");
          setSubscriptionStatus(null);
          setCancelAtPeriodEnd(false);
          setCurrentPeriodEnd(null);
          setPlanLoading(false);
          setPlanLoaded(true);
          planLoadedRef.current = true;
        }
      } catch (e) {
        console.warn("[session] loadSession failed:", e);
        if (!isMounted) return;

        setSession(null);
        setPlan("free");
        setSubscriptionStatus(null);
        setCancelAtPeriodEnd(false);
        setCurrentPeriodEnd(null);
        setPlanLoading(false);
        setPlanLoaded(true);
        planLoadedRef.current = true;
      }
    };

    loadSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (_event === "SIGNED_OUT") {
        setSession(null);
        setPlan("free");
        setSubscriptionStatus(null);
        setCancelAtPeriodEnd(false);
        setCurrentPeriodEnd(null);
        setPlanLoading(false);
        setPlanLoaded(true);
        return;
      }

      setSession(newSession);

      const userId = newSession?.user?.id;
      if (!userId) {
        setPlan("free");
        setSubscriptionStatus(null);
        setCancelAtPeriodEnd(false);
        setCurrentPeriodEnd(null);
        setPlanLoading(false);
        setPlanLoaded(true);
        return;
      }

      if (_event === "TOKEN_REFRESHED") {
        if (!planLoadedRef.current) fetchPlan(userId);
        else setPlanLoading(false);
        return;
      }

      supabase
        .from("users_extended")
        .update({ last_login: new Date().toISOString() })
        .eq("user_id", userId)
        .then(() => {})
        .catch((e) =>
          console.warn("[users_extended] last_login update failed:", e),
        );

      fetchPlan(userId);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  return (
    <SupabaseContext.Provider
      value={{
        supabase,
        session,
        plan,
        subscriptionStatus,
        cancelAtPeriodEnd,
        currentPeriodEnd,
        planLoading,
        planLoaded,
      }}
    >
      {children}
    </SupabaseContext.Provider>
  );
}

export function useSupabase() {
  return useContext(SupabaseContext);
}
