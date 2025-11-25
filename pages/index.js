import dynamic from "next/dynamic";
import { useContext } from "react";
import { AuthContext } from "../contexts/AuthContext";
import LogoutButton from "@/src/components/LogoutButton"; // ← これが重要！

const EnglishTrapQuestions = dynamic(
  () => import("@/src/components/EnglishTrapQuestions"),
  { ssr: false }
);

export default function Home() {
  const user = useContext(AuthContext);

  if (user === undefined) {
    return (
      <p style={{ textAlign: "center", marginTop: "50px" }}>読み込み中...</p>
    );
  }

  if (user === null) {
    if (typeof window !== "undefined") {
      window.location.href = "/login";
    }
    return null;
  }

  return (
    <>
      <EnglishTrapQuestions />
      <LogoutButton /> {/* ← これでOK！ */}
    </>
  );
}
