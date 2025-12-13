// pages/HomeCSR.jsx

export const dynamic = "error";
export const revalidate = 0;
export const fetchCache = "only-no-store";

import { default as nextDynamic } from "next/dynamic";
import { useSupabase } from "@/src/providers/SupabaseProvider";
import { useEffect } from "react";

const EnglishTrapQuestions = nextDynamic(
  () => import("../src/components/EnglishTrapQuestions.jsx"),
  { ssr: false }
);

export default function HomeCSR() {
  const ctx = useSupabase();

  // Provider 初期化待ち
  if (!ctx) {
    return (
      <p style={{ textAlign: "center", marginTop: "50px" }}>
        読み込み中...(Provider)
      </p>
    );
  }

  const { session } = ctx;

  // session === null → 未ログイン
  useEffect(() => {
    if (session === null) {
      window.location.href = "/login";
    }
  }, [session]);

  // session 未取得
  if (session === undefined) {
    return (
      <p style={{ textAlign: "center", marginTop: "50px" }}>
        読み込み中...(session)
      </p>
    );
  }

  // session あり → EnglishTrapQuestions を読み込む
  return <EnglishTrapQuestions />;
}
