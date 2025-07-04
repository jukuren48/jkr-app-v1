// EnglishTrapQuestions.jsx - Google TTS対応版
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

function Character({ mood }) {
  const expressions = {
    neutral: { emoji: "😊", message: "がんばれー！" },
    happy: { emoji: "😃", message: "よくできたね！" },
    sad: { emoji: "😢💦", message: "おしい！もう一度がんばろう" },
  };

  return (
    <div className="flex items-center justify-center p-4 bg-yellow-50 rounded-lg shadow-md">
      <span className="text-6xl">{expressions[mood].emoji}</span>
      <p className="ml-4 text-xl font-bold">{expressions[mood].message}</p>
    </div>
  );
}

// TTS用ボタンコンポーネント
function TTSButton({ text }) {
  const [loading, setLoading] = useState(false);

  const speakText = async () => {
    if (!text) {
      alert("読み上げるテキストがありません。");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });

      if (!res.ok) {
        throw new Error("TTS APIエラー");
      }

      const data = await res.json();

      // 空白・改行を除去
      const audioSrc = `data:audio/mp3;base64,${data.audioContent.replace(
        /\s+/g,
        ""
      )}`;

      // デバッグログを追加
      console.log("audioSrc", audioSrc);

      const audio = new Audio(audioSrc);
      await audio.play();
    } catch (err) {
      console.error("音声再生エラー:", err);
      alert("音声の取得または再生に失敗しました。");
    }
    setLoading(false);
  };

  return (
    <button
      onClick={speakText}
      disabled={loading}
      className="ml-2 px-2 py-1 bg-blue-300 rounded hover:bg-blue-400 transition"
    >
      {loading ? "🔄 読み上げ中..." : "🔊 聞く"}
    </button>
  );
}

export default function EnglishTrapQuestions() {
  const [questions, setQuestions] = useState([]);
  const [units, setUnits] = useState([]);
  const [selectedUnits, setSelectedUnits] = useState([]);
  const [questionCount, setQuestionCount] = useState(null);
  const [filteredQuestions, setFilteredQuestions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showQuestions, setShowQuestions] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [answers, setAnswers] = useState({});
  const [showFeedback, setShowFeedback] = useState(false);
  const [selectedChoice, setSelectedChoice] = useState(null);
  const [isCorrect, setIsCorrect] = useState(false);
  const [mistakes, setMistakes] = useState({});
  const [initialQuestions, setInitialQuestions] = useState([]);
  const [firstMistakeAnswers, setFirstMistakeAnswers] = useState({});
  const [characterMood, setCharacterMood] = useState("neutral");

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
    setCharacterMood("neutral");
    setFilteredQuestions(limited);
    setInitialQuestions(limited);
    setCurrentIndex(0);
    setAnswers({});
    setShowQuestions(true);
    setShowResult(false);
    setShowFeedback(false);
    setSelectedChoice(null);
    setMistakes({});
  };

  const handleAnswer = (choice) => {
    const currentQuestion = filteredQuestions[currentIndex];
    setAnswers((prev) => ({ ...prev, [currentQuestion.id]: choice }));

    if (choice === currentQuestion.correct) {
      setCharacterMood("happy");
    } else {
      setCharacterMood("sad");
    }

    if (!mistakes[currentQuestion.id] && choice !== currentQuestion.correct) {
      setMistakes((prev) => ({ ...prev, [currentQuestion.id]: true }));
      setFirstMistakeAnswers((prev) => ({
        ...prev,
        [currentQuestion.id]: choice,
      }));
    }

    setSelectedChoice(choice);
    setIsCorrect(choice === currentQuestion.correct);
    setShowFeedback(true);
  };

  const handleNext = () => {
    if (isCorrect) {
      if (currentIndex + 1 < filteredQuestions.length) {
        setCurrentIndex(currentIndex + 1);
      } else {
        setShowQuestions(false);
        setShowResult(true);
      }
    }
    setSelectedChoice(null);
    setShowFeedback(false);
  };

  const handleRetrySame = () => {
    if (initialQuestions.length === 0) {
      handleRetryNew();
      return;
    }

    setFilteredQuestions([...initialQuestions]);
    setCurrentIndex(0);
    setAnswers({});
    setMistakes({});
    setShowQuestions(true);
    setShowResult(false);
    setShowFeedback(false);
    setSelectedChoice(null);
    setIsCorrect(false);
    setFirstMistakeAnswers({});
  };

  const handleRetryNew = () => {
    setShowQuestions(false);
    setShowResult(false);
    //setSelectedUnits([]);
    setQuestionCount(null);
    setAnswers({});
    setShowFeedback(false);
    setSelectedChoice(null);
    setIsCorrect(false);
    setMistakes({});
    setFilteredQuestions([]);
    setInitialQuestions([]);
    setFirstMistakeAnswers({});
  };

  const playExplanation = async (text) => {
    if (!text) return;
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error("TTS APIエラー");

      const data = await res.json();
      const audioSrc = `data:audio/mp3;base64,${data.audioContent.replace(
        /\s+/g,
        ""
      )}`;
      const audio = new Audio(audioSrc);
      await audio.play();
    } catch (err) {
      console.error("自動音声エラー:", err);
    }
  };

  useEffect(() => {
    if (showFeedback && !isCorrect) {
      if (currentQuestion?.incorrectExplanations?.[selectedChoice]) {
        playExplanation(currentQuestion.incorrectExplanations[selectedChoice]);
      } else if (currentQuestion?.explanation) {
        playExplanation(currentQuestion.explanation);
      }
    }
  }, [showFeedback]);

  const correctAnswers = filteredQuestions.filter(
    (q) => answers[q.id] === q.correct
  );
  const incorrectAnswers = filteredQuestions.filter(
    (q) => answers[q.id] !== q.correct
  );
  const incorrectQuestionsList = filteredQuestions.filter(
    (q) => mistakes[q.id]
  );

  const currentQuestion = filteredQuestions?.[currentIndex] ?? null;
  const totalQuestions = filteredQuestions.length;
  const incorrectCount = Object.keys(mistakes).length;
  const correctCount = totalQuestions - incorrectCount;
  const correctRate = Math.round((correctCount / totalQuestions) * 100);

  if (!showQuestions && !showResult && units.length === 0) {
    return <div className="p-8 text-lg">読み込み中です...</div>;
  }

  return (
    <div className="min-h-screen bg-gradient-to-r from-pink-100 to-yellow-100 max-w-4xl mx-auto p-4">
      {/* クイズ開始前の設定画面 */}
      <h1 className="text-2xl font-bold mb-4">
        英語ひっかけ問題 ～塾長からの挑戦状～
      </h1>
      {!showQuestions && !showResult && units.length > 0 && (
        <div>
          <h2 className="text-xl font-bold mb-2">単元を選んでください</h2>
          <div className="flex gap-4 mb-2">
            <button
              onClick={selectAllUnits}
              className="bg-green-200 px-3 py-1 rounded"
            >
              全選択
            </button>
            <button
              onClick={clearAllUnits}
              className="bg-red-200 px-3 py-1 rounded"
            >
              全解除
            </button>
          </div>
          <div className="flex flex-wrap gap-2 mb-4">
            {units.map((unit) => (
              <button
                key={unit}
                onClick={() => toggleUnit(unit)}
                className={`px-4 py-2 rounded border ${
                  selectedUnits.includes(unit) ? "bg-blue-300" : "bg-white"
                }`}
              >
                {unit}
              </button>
            ))}
          </div>
          <h2 className="text-xl font-bold mb-2">出題数を選んでください</h2>
          <div className="flex gap-4 mb-4">
            {[5, 10, 15, "all"].map((count) => (
              <button
                key={count}
                onClick={() => setQuestionCount(count)}
                className={`px-4 py-2 rounded border ${
                  questionCount === count ? "bg-green-300" : "bg-white"
                }`}
              >
                {count === "all" ? "すべて" : `${count}問`}
              </button>
            ))}
          </div>
          <button
            onClick={startQuiz}
            disabled={selectedUnits.length === 0 || !questionCount}
            className="bg-pink-400 hover:bg-pink-500 text-white px-6 py-3 rounded-full shadow-md transition"
          >
            開始
          </button>
        </div>
      )}

      {/* クイズ進行中 */}
      {showQuestions && !showResult && (
        <div>
          <Character mood={characterMood} />
          {showFeedback ? (
            <div
              className={`p-4 rounded-lg shadow-md mb-4 ${
                isCorrect
                  ? "bg-green-100 border-green-300"
                  : "bg-red-100 border-red-300"
              }`}
            >
              <motion.h2
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 300 }}
                className="text-xl font-bold mb-4"
              >
                解答結果
              </motion.h2>

              {isCorrect ? (
                <>
                  <p className="text-green-700 font-bold text-lg">
                    ✅ 正解です！
                  </p>
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.3 }}
                    className="bg-green-50 border-l-4 border-green-400 shadow-md rounded-lg p-4 mb-2 flex items-start gap-2"
                  >
                    <span className="text-2xl">💡</span>
                    <p className="text-xl font-bold text-green-800">
                      解説: {currentQuestion?.explanation}
                    </p>
                    {currentQuestion?.explanation && (
                      <TTSButton text={currentQuestion.explanation} />
                    )}
                  </motion.div>
                </>
              ) : (
                <>
                  <p className="text-red-700 font-bold text-lg">
                    ❌ 不正解です。もう一度挑戦しよう！
                  </p>
                  {selectedChoice && (
                    <>
                      <p className="mb-2">あなたの答え: {selectedChoice}</p>
                      <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.3 }}
                        className="bg-red-100 border-4 border-red-500 shadow-2xl rounded-xl p-6 mb-4 flex items-start gap-4"
                      >
                        <span className="text-2xl">📌</span>
                        <p className="text-2xl font-extrabold text-red-800">
                          理由:{" "}
                          {currentQuestion?.incorrectExplanations?.[
                            selectedChoice
                          ] || currentQuestion?.explanation}
                        </p>
                        {(currentQuestion?.incorrectExplanations?.[
                          selectedChoice
                        ] ||
                          currentQuestion?.explanation) && (
                          <TTSButton
                            text={
                              currentQuestion.incorrectExplanations?.[
                                selectedChoice
                              ] || currentQuestion.explanation
                            }
                          />
                        )}
                      </motion.div>
                    </>
                  )}
                </>
              )}

              <button
                onClick={handleNext}
                className="bg-pink-400 hover:bg-pink-500 text-white px-6 py-3 rounded-full shadow-md transition mt-4"
              >
                次へ
              </button>
            </div>
          ) : (
            <div>
              <h2 className="text-xl font-bold mb-4">
                第{currentIndex + 1}問 / 全{filteredQuestions.length}問
              </h2>
              <div className="w-full bg-gray-300 rounded-full h-3 mb-4">
                <div
                  className="bg-green-400 h-3 rounded-full"
                  style={{
                    width: `${
                      ((currentIndex + 1) / filteredQuestions.length) * 100
                    }%`,
                  }}
                />
              </div>
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

      {/* 結果画面 */}
      {showResult && (
        <div>
          <h2 className="text-2xl font-bold mb-4">結果発表</h2>
          <p className="text-2xl font-bold mb-4">
            {correctRate >= 90
              ? "🎉 すばらしい！🥇"
              : correctRate >= 80
              ? "✨ よくできました！🥈"
              : correctRate >= 70
              ? "👍 もう少し！🥉"
              : "💪 何度も挑戦しよう！"}
          </p>
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5 }}
            className="bg-green-50 border-4 border-green-400 shadow-xl rounded-2xl p-8 mb-6 text-center"
          >
            <p className="text-7xl font-extrabold text-green-600 mb-2">
              🎯 {correctRate}%
            </p>
            <p className="text-2xl text-green-800 font-bold">あなたの正答率</p>
          </motion.div>
          <div className="mb-4">
            {incorrectQuestionsList.length > 0 && (
              <div className="mt-6">
                <h3 className="text-xl font-bold mb-2">
                  不正解だった問題と解説
                </h3>
                {incorrectQuestionsList.map((q) => (
                  <div key={q.id} className="mb-4 p-3 border rounded bg-red-50">
                    <p className="font-semibold">問題: {q.question}</p>
                    <p className="text-red-600">
                      あなたの答え: {firstMistakeAnswers[q.id]}
                    </p>
                    <p className="text-green-600">正解: {q.correct}</p>
                    <p className="mt-1 text-gray-700 flex items-center">
                      解説:{" "}
                      {q.incorrectExplanations?.[firstMistakeAnswers[q.id]] ||
                        q.explanation}
                      {(q.incorrectExplanations?.[firstMistakeAnswers[q.id]] ||
                        q.explanation) && (
                        <TTSButton
                          text={
                            q.incorrectExplanations?.[
                              firstMistakeAnswers[q.id]
                            ] || q.explanation
                          }
                        />
                      )}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="flex gap-4">
            <button
              onClick={handleRetrySame}
              className="bg-pink-400 hover:bg-pink-500 text-white px-6 py-3 rounded-full shadow-md transition"
            >
              同じ問題でもう一度
            </button>
            <button
              onClick={handleRetryNew}
              className="bg-pink-400 hover:bg-pink-500 text-white px-6 py-3 rounded-full shadow-md transition"
            >
              別の問題にチャレンジ
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
