// EnglishTrapQuestions.jsx - 完全修正版（読み込み表示＆fetch修正済み）
import { useEffect, useState } from "react";
import { motion } from "framer-motion";

function shuffleArray(array) {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export default function EnglishTrapQuestions() {
  const [questions, setQuestions] = useState([]);
  const [units, setUnits] = useState([]);
  const [selectedUnits, setSelectedUnits] = useState([]);
  const [questionCount, setQuestionCount] = useState(null);
  const [initialQuestions, setInitialQuestions] = useState([]);
  const [filteredQuestions, setFilteredQuestions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [timeLeft, setTimeLeft] = useState(10);
  const [isPaused, setIsPaused] = useState(false);
  const [showQuestions, setShowQuestions] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [answers, setAnswers] = useState({});
  const [showFeedback, setShowFeedback] = useState(false);
  const [selectedChoice, setSelectedChoice] = useState(null);

  useEffect(() => {
    fetch("/api/questions2")
      .then((res) => res.json())
      .then((data) => {
        setQuestions(data);
        const uniqueUnits = [...new Set(data.map((q) => q.unit))];
        setUnits(uniqueUnits);
      })
      .catch((error) => {
        console.error("Failed to fetch questions:", error);
      });
  }, []);

  const selectAllUnits = () => {
    setSelectedUnits([...units]);
  };

  const clearAllUnits = () => {
    setSelectedUnits([]);
  };

  const toggleUnit = (unit) => {
    setSelectedUnits((prev) =>
      prev.includes(unit) ? prev.filter((u) => u !== unit) : [...prev, unit]
    );
  };

  const startQuiz = () => {
    const filtered = questions.filter((q) => selectedUnits.includes(q.unit));
    if (filtered.length === 0) {
      alert("選択した単元に問題がありません。");
      return;
    }
    const shuffled = shuffleArray(filtered);
    const limited =
      questionCount === "all" ? shuffled : shuffled.slice(0, questionCount);
    setFilteredQuestions(limited);
    setInitialQuestions(limited);
    setCurrentIndex(0);
    setAnswers({});
    setShowQuestions(true);
    setShowResult(false);
  };

  const handleAnswer = (choice) => {
    const currentQuestion = filteredQuestions[currentIndex];
    setAnswers((prev) => ({ ...prev, [currentQuestion.id]: choice }));
    setSelectedChoice(choice);
    setShowFeedback(true);
  };

  const correctAnswers = filteredQuestions.filter(
    (q) => answers[q.id] === q.correct
  );
  const incorrectAnswers = filteredQuestions.filter(
    (q) => answers[q.id] !== q.correct
  );

  const handleRetry = () => {
    setShowQuestions(false);
    setShowResult(false);
    setSelectedUnits([]);
    setQuestionCount(null);
    setAnswers({});
  };

  const handleNext = () => {
    if (currentIndex + 1 < filteredQuestions.length) {
      setCurrentIndex(currentIndex + 1);
      setSelectedChoice(null);
      setShowFeedback(false);
    } else {
      setShowQuestions(false);
      setShowResult(true);
    }
  };

  if (!showQuestions && !showResult && units.length === 0) {
    return <div className="p-8 text-lg">読み込み中です...</div>;
  }

  return (
    <div className="max-w-4xl mx-auto p-4">
      {showQuestions && !showResult && (
        <div>
          {showFeedback ? (
            // 解答後フィードバック画面
            <div>
              <h2 className="text-xl font-bold mb-4">解答結果</h2>
              <p className="mb-2">
                {selectedChoice === filteredQuestions[currentIndex].correct
                  ? "正解です！"
                  : "不正解です。"}
              </p>
              <p className="mb-2">あなたの答え: {selectedChoice}</p>
              <p className="mb-2">
                正解: {filteredQuestions[currentIndex].correct}
              </p>
              <p className="mb-2">
                解説:{" "}
                {selectedChoice === filteredQuestions[currentIndex].correct
                  ? filteredQuestions[currentIndex].explanation
                  : filteredQuestions[currentIndex].incorrectExplanations[
                      selectedChoice
                    ] || filteredQuestions[currentIndex].explanation}
              </p>
              <button
                onClick={handleNext}
                className="bg-blue-500 text-white px-6 py-2 rounded"
              >
                次へ
              </button>
            </div>
          ) : (
            // 問題を選ぶ画面
            <div>
              <h2 className="text-xl font-bold mb-4">
                第{currentIndex + 1}問 / 全{filteredQuestions.length}問
              </h2>
              <div className="mb-2">残り時間: {timeLeft}秒</div>
              <div className="mb-4 text-lg font-semibold">
                {filteredQuestions[currentIndex]?.question}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {shuffleArray(
                  filteredQuestions[currentIndex]?.choices || []
                ).map((choice, index) => (
                  <button
                    key={index}
                    onClick={() => handleAnswer(choice)}
                    className="bg-white border rounded px-4 py-2 hover:bg-gray-100"
                  >
                    {choice}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {showResult && (
        <div>
          <h2 className="text-2xl font-bold mb-4">結果発表</h2>
          <p className="text-lg mb-2">
            正解数: {correctAnswers.length} / {filteredQuestions.length}
            （正答率:{" "}
            {Math.round(
              (correctAnswers.length / filteredQuestions.length) * 100
            )}
            %）
          </p>
          <div className="mb-4">
            {incorrectAnswers.map((q) => (
              <div key={q.id} className="mb-4 p-3 border rounded bg-red-50">
                <p className="font-semibold">問題: {q.question}</p>
                <p className="text-red-600">あなたの答え: {answers[q.id]}</p>
                <p className="text-green-600">正解: {q.correct}</p>
                <p className="mt-1 text-gray-700">
                  解説:{" "}
                  {q.incorrectExplanations?.[answers[q.id]] || q.explanation}
                </p>
              </div>
            ))}
          </div>
          <button
            onClick={handleRetry}
            className="bg-blue-500 text-white px-6 py-2 rounded"
          >
            もう一度やる
          </button>
        </div>
      )}
    </div>
  );
}
