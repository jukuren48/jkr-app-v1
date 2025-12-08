import dynamic from "next/dynamic";

export const getServerSideProps = async (ctx) => {
  // 何もしなくても SSR として扱わせるため必要
  return { props: {} };
};

const EnglishTrapQuestions = dynamic(
  () => import("@/src/components/EnglishTrapQuestions"),
  { ssr: false }
);

export default function Home() {
  return <EnglishTrapQuestions />;
}
