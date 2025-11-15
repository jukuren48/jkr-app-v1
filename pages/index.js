import dynamic from "next/dynamic";

const EnglishTrapQuestions = dynamic(
  () => import("@/src/components/EnglishTrapQuestions"),
  { ssr: false }
);

export default function Home() {
  console.log("✅ Reactはここまで到達しました");
  return (
    <div>
      <EnglishTrapQuestions />
    </div>
  );
}
