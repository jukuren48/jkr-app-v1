import dynamic from "next/dynamic";

const EnglishTrapQuestions = dynamic(
  () => import("@/src/components/EnglishTrapQuestions"),
  { ssr: false }
);

export default function Home() {
  return (
    <div>
      <EnglishTrapQuestions />
    </div>
  );
}
