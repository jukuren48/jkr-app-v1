// EnglishTrapQuestions.jsx - Google TTS対応版 + 制限時間機能追加
import { useEffect, useState, useRef, useMemo } from "react";
import { motion } from "framer-motion";

// ===== Audio Utility (iPhone対応版) =====
let audioCtx;
let bgmGain, qbgmGain, sfxGain;
let bgmSource = null,
  qbgmSource = null;

function unlockAudio() {
  if (audioCtx && audioCtx.state === "suspended") {
    audioCtx.resume().then(() => {
      console.log("[Audio] resumed on user gesture");
    });
  }
}

async function ensureAudioResume() {
  if (audioCtx && audioCtx.state === "suspended") {
    await audioCtx.resume();
    console.log("[Audio] resumed before BGM play");
  }
}

// 最初のクリック/タップで必ず呼ぶ
document.addEventListener("touchstart", unlockAudio, { once: true });
document.addEventListener("click", unlockAudio, { once: true });

function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    bgmGain = audioCtx.createGain();
    qbgmGain = audioCtx.createGain();
    sfxGain = audioCtx.createGain();

    bgmGain.connect(audioCtx.destination);
    qbgmGain.connect(audioCtx.destination);
    sfxGain.connect(audioCtx.destination);

    bgmGain.gain.value = 0.0; // 最初は無音
    qbgmGain.gain.value = 0.0; // 最初は無音
    sfxGain.gain.value = 1.0; // 効果音は常時オン
  }
}

async function ensureLoop(src, gainNode, storeRefName) {
  initAudio();

  if (storeRefName === "bgm" && bgmSource) {
    console.log("[ensureLoop] bgm already playing → skip");
    return;
  }
  if (storeRefName === "qbgm" && qbgmSource) {
    console.log("[ensureLoop] qbgm already playing → skip");
    return;
  }

  const res = await fetch(src);
  const buf = await res.arrayBuffer();
  const audioBuffer = await audioCtx.decodeAudioData(buf);

  const source = audioCtx.createBufferSource();
  source.buffer = audioBuffer;
  source.loop = true;
  source.connect(gainNode);
  source.start(0);

  if (storeRefName === "bgm") bgmSource = source;
  if (storeRefName === "qbgm") qbgmSource = source;
}

function fadeInBGM(gainNode, targetVolume = 1.0, duration = 2.0) {
  if (!audioCtx || !gainNode) return;

  const now = audioCtx.currentTime;
  gainNode.gain.cancelScheduledValues(now);
  gainNode.gain.setValueAtTime(0, now); // いったん0から
  gainNode.gain.linearRampToValueAtTime(targetVolume, now + duration);
}

// アプリ起動後、最初のユーザー操作で呼ぶ
async function startAllBGMs() {
  initAudio(); // ✅ 先に必ず呼ぶ
  await ensureLoop("/sounds/bgm.mp3", bgmGain, "bgm");
  await ensureLoop("/sounds/qbgm.mp3", qbgmGain, "qbgm");
}

async function playSFX(src) {
  initAudio();

  const res = await fetch(src);
  const buf = await res.arrayBuffer();
  const audioBuffer = await audioCtx.decodeAudioData(buf);

  const source = audioCtx.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(sfxGain);
  source.start(0);
}

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
    panic: { emoji: "😱", message: "時間切れ〜！！" },
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

      if (!res.ok) throw new Error("TTS APIエラー");

      const data = await res.json();
      const audioSrc = `data:audio/mp3;base64,${data.audioContent.replace(
        /\s+/g,
        ""
      )}`;
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

// 入力文字列の正規化（大文字小文字・全角半角・末尾句読点を吸収）
const normText = (s = "") =>
  s
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (ch) =>
      String.fromCharCode(ch.charCodeAt(0) - 0xfee0)
    )
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[。．，、・！？；：]+$/u, "")
    .replace(/[.,!?;:]+$/u, "")
    .replace(/\s+/g, " ");

// 正答が「in front of / in the front of」のように複数書かれている場合に分割
const expandCorrects = (raw) => {
  if (Array.isArray(raw)) return raw;
  if (raw == null) return [];
  return String(raw)
    .split(/\s*(\/|｜|\||,|，)\s*/)
    .filter(Boolean);
};

const normEn = (s = "") =>
  s
    .trim()
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[.,!?;:]+$/g, "") // 末尾の句読点を削除
    .replace(/\s+/g, " ");

const normJa = (s = "") =>
  s
    .trim()
    .replace(/[。！？、・（）()\[\]「」『』【】]+$/g, "") // 末尾の記号を削除
    .replace(/\s+/g, "");

export default function EnglishTrapQuestions() {
  const [questions, setQuestions] = useState([]);
  const [questionList, setQuestionList] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("questionList");
      return saved ? JSON.parse(saved) : [];
    }
    return [];
  });
  const [units, setUnits] = useState([]);
  // 0: 未選択, 1: 両方, 2: 選択のみ, 3: 記述のみ
  const [unitModes, setUnitModes] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("unitModes");
      return saved ? JSON.parse(saved) : {};
    }
    return {};
  });
  // 効果音 ON/OFF（← これを state 群の先頭付近に）
  const [soundEnabled, setSoundEnabled] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("soundEnabled") === "true";
    }
    return false; // 初期状態は OFF
  });

  //async function stopBGM() {
  //  console.log("[stopBGM] called");
  //  if (bgmSource) {
  //    try {
  //      bgmSource.stop();
  //      bgmSource.disconnect();
  //    } catch (e) {
  //      console.warn("[stopBGM] error", e);
  //    }
  //    bgmSource = null;
  //  }
  //  currentBgmSrc = null;
  //if (bgmGain) bgmGain.gain.value = 0;

  // ✅ Safari対策: 100ms待機してから次を流す
  //  await new Promise((r) => setTimeout(r, 100));
  //}

  const [questionCount, setQuestionCount] = useState(null);
  const [filteredQuestions, setFilteredQuestions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showQuestions, setShowQuestions] = useState(false);
  const [showQuestionModal, setShowQuestionModal] = useState(false);
  const [showResult, setShowResult] = useState(false);
  //const [answers, setAnswers] = useState({});
  const [showFeedback, setShowFeedback] = useState(false);
  const [selectedChoice, setSelectedChoice] = useState(null);
  const [isCorrect, setIsCorrect] = useState(false);
  const [mistakes, setMistakes] = useState({});
  const [initialQuestions, setInitialQuestions] = useState([]);
  const [firstMistakeAnswers, setFirstMistakeAnswers] = useState({});
  const [characterMood, setCharacterMood] = useState("neutral");
  const [inputAnswer, setInputAnswer] = useState("");
  const [lastLength, setLastLength] = useState(0);
  const [lastTime, setLastTime] = useState(Date.now());
  const [showWarning, setShowWarning] = useState(false);
  const [inputHistory, setInputHistory] = useState([]);
  const [selectedWord, setSelectedWord] = useState(null);
  const [wordMeaning, setWordMeaning] = useState("");
  //const [wordAudioSrc, setWordAudioSrc] = useState("");
  const [hintLevel, setHintLevel] = useState(0);
  const [hintText, setHintText] = useState("");
  const [hintLevels, setHintLevels] = useState({});
  const [addMessage, setAddMessage] = useState("");
  const [inputDisabled, setInputDisabled] = useState(false);
  const [showAnswer, setShowAnswer] = useState(false);
  // 選択肢を一度だけシャッフルして保持
  const [shuffledChoices, setShuffledChoices] = useState([]);

  // 🔽 追加: タイマー state
  const [timeLeft, setTimeLeft] = useState(0);
  const [timerActive, setTimerActive] = useState(false);
  const [maxTime, setMaxTime] = useState(0);
  const [timeUp, setTimeUp] = useState(false);
  const [countPlayedForQuestion, setCountPlayedForQuestion] = useState({});

  // 単語帳（英単語と意味を保存）
  const [wordList, setWordList] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("wordList");
      return saved ? JSON.parse(saved) : [];
    }
    return [];
  });
  //const [showWordBook, setShowWordBook] = useState(false);
  const [showWordList, setShowWordList] = useState(false);
  const [showWordTest, setShowWordTest] = useState(false);
  const [testIndex, setTestIndex] = useState(0);
  const [testWord, setTestWord] = useState(null);
  const [answer, setAnswer] = useState("");
  const [wrongWords, setWrongWords] = useState([]);
  const [round, setRound] = useState(1); // 1 = 英→日, 2 = 日→英
  const [lastLengthTest, setLastLengthTest] = useState(0);
  const [showWarningTest, setShowWarningTest] = useState(false);

  // デバッグログ用（不要になったら削除してOK）
  const [debugLogs, setDebugLogs] = useState([]);

  function log(message) {
    console.log(message); // PC用にも出す
    setDebugLogs((prev) => [...prev.slice(-20), message]);
    // ← 最大20件だけ保持して古いのは削除
  }

  function muteBGM() {
    initAudio();
    if (bgmGain) {
      bgmGain.gain.value = 0;
      log("[BGM] muted " + audioCtx?.state);
    } else {
      log("[BGM] mute skipped - no bgmGain");
    }
  }

  async function unmuteBGM() {
    initAudio();
    if (audioCtx && audioCtx.state === "suspended") {
      try {
        await audioCtx.resume();
        log("[BGM] resumed in unmuteBGM → state=" + audioCtx.state);
      } catch (e) {
        log("[BGM] resume failed in unmuteBGM");
      }
    }
    if (bgmGain) {
      bgmGain.gain.value = 1.0;
      log("[BGM] unmuted " + audioCtx?.state);
    } else {
      log("[BGM] unmute skipped - no bgmGain");
    }
  }

  // 音量（0〜100）
  const [masterVol, setMasterVol] = useState(() => {
    if (typeof window === "undefined") return 100;
    return Number(localStorage.getItem("vol_master") ?? 100);
  });
  const [sfxVol, setSfxVol] = useState(() => {
    if (typeof window === "undefined") return 100;
    return Number(localStorage.getItem("vol_sfx") ?? 100);
  });
  const [bgmVol, setBgmVol] = useState(() => {
    if (typeof window === "undefined") return 50;
    return Number(localStorage.getItem("vol_bgm") ?? 50);
  });

  const firstRunRef = useRef(true);

  // 効果音付きボタンハンドラ
  const playButtonSound = (callback) => {
    if (soundEnabled) {
      playSFX("/sounds/botan.mp3");
    }
    if (callback) callback();
  };

  // 参照（GainやBuffer保持）
  const soundsRef = useRef({}); // { count, timeup, correct, wrong, bgm } を保持
  const masterGainRef = useRef(null);
  const sfxGainRef = useRef(null);
  const bgmGainRef = useRef(null);
  const bgmSourceRef = useRef(null);

  const toggleUnitMode = (unit) => {
    setUnitModes((prev) => {
      const current = prev[unit] || 0;
      const next = (current + 1) % 4; // 0→1→2→3→0…
      return { ...prev, [unit]: next };
    });
  };

  const currentQuestion = filteredQuestions?.[currentIndex] ?? null;

  const startedRef = useRef(false);

  useEffect(() => {
    if (soundEnabled && !startedRef.current) {
      startAllBGMs();
      startedRef.current = true;
    }
  }, [soundEnabled]);

  //useEffect(() => {
  //  if (soundEnabled) {
  //    startAllBGMs(); // ✅ ここで裏で両方流しておく
  //  }
  //}, [soundEnabled]);

  // unitModes が更新されたら localStorage に保存
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("unitModes", JSON.stringify(unitModes));
    }
  }, [unitModes]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("soundEnabled");
      if (saved !== null) {
        setSoundEnabled(saved === "true");
      }
    }
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("soundEnabled", String(soundEnabled));
    }
  }, [soundEnabled]);

  useEffect(() => {
    localStorage.setItem("questionList", JSON.stringify(questionList));
  }, [questionList]);

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

  const speakExplanation = async (text, lang = "ja-JP") => {
    if (!text || text.trim() === "") return;
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, lang }),
      });
      if (!res.ok) throw new Error("TTS API error");

      const data = await res.json();
      const audioSrc = `data:audio/mp3;base64,${data.audioContent.replace(
        /\s+/g,
        ""
      )}`;
      const audio = new Audio(audioSrc);
      await audio.play();
    } catch (err) {
      console.error("音声再生エラー:", err);
    }
  };

  const handleWordClick = async (word) => {
    // ✅ 単語を正規化（末尾ピリオド等を除去）
    const cleanWord = normEn(word);

    setSelectedWord(cleanWord);
    setWordMeaning("翻訳中...");

    // 🔹 英単語を音声で再生
    await speakExplanation(cleanWord, "en-US");

    try {
      const res = await fetch(
        `/api/translate?word=${encodeURIComponent(cleanWord)}`
      );
      if (!res.ok) throw new Error("Translation API error");
      const data = await res.json();

      // ✅ 日本語訳を正規化（末尾「。」などを除去）
      const meaning = normJa(data.translation);

      setWordMeaning(meaning);

      // ✅ 単語帳に保存（重複チェックあり）
      setWordList((prev) => {
        if (prev.some((item) => item.word === cleanWord)) return prev;
        return [...prev, { word: cleanWord, meaning }];
      });
    } catch (err) {
      console.error(err);
      setWordMeaning("意味を取得できませんでした");
    }
  };

  const selectAllUnits = () => {
    const newModes = {};
    units.forEach((u) => (newModes[u] = 1)); // 1 = 両方
    setUnitModes(newModes);
  };
  const clearAllUnits = () => {
    const newModes = {};
    units.forEach((u) => (newModes[u] = 0)); // 0 = 未選択
    setUnitModes(newModes);
  };
  const filtered = useMemo(() => {
    return questions.filter((q) => {
      const mode = unitModes[q.unit] || 0;
      if (mode === 0) return false; // 未選択
      if (mode === 1) return true; // 両方
      if (mode === 2) return q.type === "multiple-choice"; // 選択問題のみ
      if (mode === 3) return q.type === "input"; // 記述問題のみ
      return false;
    });
  }, [questions, unitModes]);

  // クイズ開始処理
  const startQuiz = () => {
    //if (soundEnabled) {
    //  //stopBGM();
    //  playBGM("/sounds/qbgm.mp3"); // ← クイズ開始BGMをここで確実に流す
    //}
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
    setShowQuestions(true);
    setShowResult(false);
    setShowFeedback(false);
    setSelectedChoice(null);
    setMistakes({});
  };

  // 出題対象の問題を作る処理
  useEffect(() => {
    if (questions.length > 0 && Object.keys(unitModes).length > 0) {
      const selected = questions.filter((q) => {
        const mode = unitModes[q.unit] || 0;
        if (mode === 0) return false; // 未選択 → 出さない
        if (mode === 1) return true; // 両方 → 出す
        if (mode === 2) return q.type === "multiple-choice"; // 選択問題のみ
        if (mode === 3) return q.type === "input"; // 記述問題のみ
        return false;
      });

      setFilteredQuestions(selected);
    }
  }, [questions, unitModes]);

  // 起動時に一度だけBGM再生
  //useEffect(() => {
  //  playBGM("/sounds/bgm.mp3");
  //}, []);

  // 切り替えは音量制御のみ

  useEffect(() => {
    if (!showQuestions && !showResult) {
      // 単元選択画面
      if (soundEnabled) {
        (async () => {
          try {
            if (audioCtx?.state === "suspended") {
              await audioCtx.resume();
              console.log("[Audio] resumed in unit select");
            }
            if (bgmGain) {
              bgmGain.gain.value = 1.0;
            }
          } catch (e) {
            console.warn("[Audio] resume failed in unit select", e);
          }
        })();
      }
    }
  }, [showQuestions, showResult, soundEnabled]);

  useEffect(() => {
    const applyBGM = async () => {
      initAudio();

      if (!soundEnabled) {
        bgmGain.gain.value = 0;
        qbgmGain.gain.value = 0;
        return;
      }

      // 🔑 iPhone用: ここで必ず resume() を試みる
      await ensureAudioResume();

      if (showQuestions) {
        fadeInBGM(qbgmGain, 0.5, 2.0); // 2秒かけてフェードイン
        bgmGain.gain.value = 0; // 他のBGMは消す
      } else if (!showQuestions && !showResult) {
        bgmGain.gain.value = 0.5;
        qbgmGain.gain.value = 0;
      } else if (showResult) {
        bgmGain.gain.value = 0.001;
        qbgmGain.gain.value = 0;
      }
    };

    applyBGM();
  }, [soundEnabled, showQuestions, showResult]);

  useEffect(() => {
    const unlockAudio = () => {
      if (audioCtx && audioCtx.state === "suspended") {
        audioCtx.resume().then(() => {
          console.log("[Audio] resumed on first gesture");
        });
      }
    };

    // ✅ iOSは touchstart の方が確実
    document.addEventListener("touchstart", unlockAudio, { once: true });
    document.addEventListener("click", unlockAudio, { once: true });

    return () => {
      document.removeEventListener("touchstart", unlockAudio);
      document.removeEventListener("click", unlockAudio);
    };
  }, []);

  useEffect(() => {
    localStorage.setItem("vol_master", String(masterVol));
    if (masterGainRef.current && audioCtx) {
      masterGainRef.current.gain.setValueAtTime(
        masterVol / 100,
        audioCtx.currentTime
      );
    }
  }, [masterVol]);

  useEffect(() => {
    localStorage.setItem("vol_sfx", String(sfxVol));
    if (sfxGainRef.current && audioCtx) {
      sfxGainRef.current.gain.setValueAtTime(
        sfxVol / 100,
        audioCtx.currentTime
      );
    }
  }, [sfxVol]);

  useEffect(() => {
    localStorage.setItem("vol_bgm", String(bgmVol));
    if (bgmGainRef.current && audioCtx) {
      bgmGainRef.current.gain.setValueAtTime(
        bgmVol / 100,
        audioCtx.currentTime
      );
    }
  }, [bgmVol]);

  useEffect(() => {
    if (!soundEnabled) return; // 🔇 OFFなら鳴らさない
    // 単元選択画面が表示されたときに再生
    if (soundEnabled && !showQuestions && !showResult && units.length > 0) {
      playSFX("/sounds/sentaku.mp3");
    }
  }, [soundEnabled, showQuestions, showResult, units]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("soundEnabled", String(soundEnabled));
    }
  }, [soundEnabled]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("wordList", JSON.stringify(wordList));
    }
  }, [wordList]);

  useEffect(() => {
    if (!soundEnabled) return; // 🔇 OFFなら鳴らさない
    if (showQuestions && currentQuestion) {
      let soundFile = null;

      if (currentIndex === 0) {
        // ✅ 最初の問題
        soundFile = "/sounds/deden.mp3"; // ← 1問目専用の音
      } else {
        // ✅ 2問目以降
        soundFile = "/sounds/mondai.mp3"; // ← 通常の出題音
      }

      if (soundFile) {
        playSFX(soundFile);
      }
    }
  }, [currentIndex, showQuestions]);

  // 🔽 追加: 問題切り替え時に制限時間を設定
  useEffect(() => {
    if (!currentQuestion || showFeedback || showResult) return;

    let limit = 15; // デフォルト
    if (currentQuestion.type === "input") {
      limit = 45; // 記述問題
    } else if (currentQuestion.type === "multiple-choice") {
      if (currentQuestion.unit && currentQuestion.unit.includes("読解")) {
        limit = 30; // 読解問題
      } else {
        limit = 15; // 通常の選択問題
      }
    }

    setTimeLeft(limit);
    setMaxTime(limit);
    setTimerActive(true);
    setShowAnswer(false);
  }, [currentQuestion, showFeedback, showResult]);

  // 🔽 カウントダウン処理
  useEffect(() => {
    if (!showQuestions) return; // ← クイズ画面でなければタイマー止める
    if (!timerActive || timeLeft <= 0 || showResult) return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => prev - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [timerActive, timeLeft, showResult, showQuestions]);

  // 🔽 カウントダウン音 (残り5秒以内)
  useEffect(() => {
    if (
      !showQuestions || // ← ここでしっかりガード
      !timerActive ||
      showResult ||
      timeLeft <= 0 ||
      !soundEnabled
    )
      return;

    if (timeLeft <= 5) {
      const key = `${currentIndex}-${timeLeft}`;
      if (!countPlayedForQuestion[key]) {
        //const audio = new Audio("/sounds/count.mp3");
        //audio.play().catch((err) => console.error("カウント音エラー:", err));
        playSFX("/sounds/count.mp3");
        setCountPlayedForQuestion((prev) => ({ ...prev, [key]: true }));
      }
    }
  }, [
    timeLeft,
    timerActive,
    //showResult,
    soundEnabled,
    showQuestions,
    currentIndex,
  ]);

  // 解説の自動読み上げ
  useEffect(() => {
    if (!showFeedback) return; // 解答結果画面のみ
    if (isCorrect) return; // 正解時は自動で流さない
    if (!currentQuestion) return;
    if (!currentQuestion.explanation) return;

    // ❌ 二重再生防止のため、失敗した時だけ自動再生
    speakExplanation(currentQuestion.explanation);
  }, [showFeedback, isCorrect, currentQuestion]);

  // クイズBGMや音声を止める
  //useEffect(() => {
  //  return () => {
  //    stopQuizBGM();
  //    if (bgmRef.current) {
  //      bgmRef.current.pause();
  //      bgmRef.current = null;
  //    }
  //  };
  //}, []);

  // 時間切れ処理
  useEffect(() => {
    if (!timerActive || timeLeft > 0 || !currentQuestion || showResult) return;

    setTimerActive(false);
    setCharacterMood("panic");
    setTimeUp(true); // 時間切れ演出フラグON

    // 時間切れ音を再生
    if (soundEnabled) {
      //const audio = new Audio("/sounds/timesup.mp3");
      //audio
      //  .play()
      //  .catch((err) => console.error("時間切れ音の再生に失敗:", err));
      playSFX("/sounds/timesup.mp3");
    }

    // 1.5秒後に解答結果画面に切り替える
    setTimeout(() => {
      setShowFeedback(true);
      setIsCorrect(false);
      setShowAnswer(true);
      setSelectedChoice("（時間切れ）");
      setTimeUp(false); // 演出を消す
      if (!mistakes[currentQuestion.id]) {
        setMistakes((prev) => ({ ...prev, [currentQuestion.id]: true }));
        setFirstMistakeAnswers((prev) => ({
          ...prev,
          [currentQuestion.id]: "（時間切れ）",
        }));
      }
    }, 1500);
  }, [
    timeLeft,
    timerActive,
    currentQuestion,
    mistakes,
    showResult,
    soundEnabled,
  ]);

  useEffect(() => {
    if (!showResult) return; // 結果画面以外は処理しない

    // タイマー停止処理
    setTimerActive(false);
    setTimeLeft(0);
    setTimeUp(false);

    if (!soundEnabled) return; // 🔇 サウンドOFFなら処理しない

    // 効果音を再生
    const playResultSound = () => {
      let soundFile = null;

      if (adjustedCorrectRate === 100) {
        soundFile = "/sounds/manten.mp3";
      } else if (adjustedCorrectRate >= 80) {
        soundFile = "/sounds/yokudekimasita.mp3";
      } else if (adjustedCorrectRate > 0) {
        soundFile = "/sounds/ganbarimasho.mp3";
      } else {
        soundFile = "/sounds/zero.mp3";
      }

      if (soundFile) {
        //stopBGM();
        muteBGM();
        playSFX(soundFile);
      }
    };

    playResultSound();
  }, [showResult]);

  useEffect(() => {
    if (currentQuestion?.choices) {
      setShuffledChoices(shuffleArray(currentQuestion.choices));
    }
  }, [currentQuestion]);

  const handleInputChange = (e) => {
    const value = e.target.value;

    // 直前から2文字以上まとめて増えた場合は候補入力の可能性あり
    if (value.length - lastLength > 1) {
      setShowWarning(true);
      setInputAnswer(""); // 入力リセット
    } else {
      setShowWarning(false);
      setInputAnswer(value);
    }

    setLastLength(value.length);
  };

  const handleTestInputChange = (e) => {
    const value = e.target.value;
    const diff = value.length - lastLengthTest;

    if (diff > 1) {
      setShowWarningTest(true);
      setAnswer(""); // リセット
    } else {
      setShowWarningTest(false);
      setAnswer(value); // 正常入力
    }
    setLastLengthTest(value.length);
  };

  const handleAnswer = (answer) => {
    const currentQuestion = filteredQuestions[currentIndex];
    let isCorrectAnswer = false;

    if (currentQuestion.type === "multiple-choice") {
      isCorrectAnswer = answer === currentQuestion.correct;
    } else if (currentQuestion.type === "input") {
      // 正答候補を展開
      const raw = Array.isArray(currentQuestion.correct)
        ? currentQuestion.correct
        : Array.isArray(currentQuestion.correctAnswers)
        ? currentQuestion.correctAnswers
        : currentQuestion.correctAnswer ?? currentQuestion.correct ?? "";

      const corrects = expandCorrects(raw)
        .map((c) => normEn(c)) // ✅ 英語用に正規化
        .filter((c) => c.length > 0);

      const user = normEn(inputAnswer); // ✅ ユーザー入力も英語用正規化

      isCorrectAnswer = corrects.some((c) => c === user);

      // デバッグ用
      console.log("判定チェック", { user, corrects });
    }

    //setAnswers((prev) => ({ ...prev, [currentQuestion.id]: answer }));

    if (isCorrectAnswer) {
      setCharacterMood("happy");
      if (soundEnabled) {
        playSFX("/sounds/correct.mp3");
      }
    } else {
      setCharacterMood("sad");
      if (soundEnabled) {
        playSFX("/sounds/wrong.mp3");
      }
      if (!mistakes[currentQuestion.id]) {
        setMistakes((prev) => ({ ...prev, [currentQuestion.id]: true }));
        setFirstMistakeAnswers((prev) => ({
          ...prev,
          [currentQuestion.id]: answer,
        }));
      }
    }

    setSelectedChoice(answer);
    setIsCorrect(isCorrectAnswer);
    setShowFeedback(true);
    setTimerActive(false); // 🔽 回答時にタイマー停止
    setInputAnswer("");
    setHintLevel(0);
    setHintText("");
  };
  const handleNext = () => {
    setCharacterMood("neutral");

    if (isCorrect) {
      // ✅ 正解なら次の問題へ
      if (currentIndex + 1 < filteredQuestions.length) {
        setCurrentIndex(currentIndex + 1);
      } else {
        setShowQuestions(false);
        setShowResult(true);
        setTimerActive(false);
        setTimeLeft(0);
      }
      setShowFeedback(false); // ← 正解時もリセットが必要
    } else {
      // ❌ 不正解なら同じ問題をもう一度
      if (soundEnabled) {
        playSFX("/sounds/ganba.mp3");
      }
      setShowFeedback(false); // ← 不正解時も再挑戦のためリセット
    }

    setSelectedChoice(null);
    setTimeout(() => setInputDisabled(false), 300);
  };

  const startWordTest = () => {
    if (wordList.length === 0) {
      alert("単語帳が空です");
      return;
    }
    setRound(1);
    setTestIndex(0);
    setTestWord(wordList[0]);
    setWrongWords([]);
    setAnswer("");
    setShowWordTest(true);
  };

  const restartQuiz = () => {
    //if (soundEnabled) {
    //stopBGM();
    //  playBGM("/sounds/qbgm.mp3"); // ← クイズ開始BGMをここで確実に流す
    //}
    setCharacterMood("neutral");
    setCurrentIndex(0);
    //setAnswers({});
    setMistakes({});
    setFirstMistakeAnswers({});
    setShowQuestions(true);
    setShowResult(false);
    setShowFeedback(false);
    setSelectedChoice(null);
    setInputAnswer("");
    setHintLevel(0);
    setHintText("");
    setTimerActive(false);
    setTimeLeft(0);

    // 🔽 同じ問題を最初から出す
    setFilteredQuestions([...initialQuestions]);
  };

  const hintPenalties = [2, 5, 10];

  const generateHint = () => {
    const answer = currentQuestion?.correct; // ← correct に修正
    if (!answer) return "";

    const words = answer.trim().split(/\s+/);
    const hintPercents = [20, 50, 100];
    const percent = hintPercents[Math.min(hintLevel, 2)];
    const numWords = Math.ceil((percent / 100) * words.length);
    return words.slice(0, numWords).join(" ");
  };

  const handleShowHint = () => {
    if (hintLevel < 3) {
      const nextLevel = hintLevel + 1;
      setHintLevel(nextLevel);
      setHintText(generateHint());

      setHintLevels((prev) => ({
        ...prev,
        [currentQuestion.id]: nextLevel,
      }));
    }
  };

  const handleAddToQuestionList = () => {
    if (!currentQuestion) return;

    const isAlreadySaved = questionList.some(
      (item) => item.id === currentQuestion.id
    );
    if (isAlreadySaved) {
      setAddMessage("この質問はすでに質問ボックスに入っています。");
      return;
    }

    const questionItem = {
      id: currentQuestion.id,
      question: currentQuestion.question || currentQuestion.prompt,
      answer: selectedChoice || inputAnswer,
      correct: currentQuestion.correct || currentQuestion.correctAnswer,
      explanation: currentQuestion.explanation,
    };

    setQuestionList((prev) => [...prev, questionItem]);
    setAddMessage("質問ボックスに保存しました！");

    setTimeout(() => setAddMessage(""), 3000);
  };

  const handleAddSpecificQuestionToList = (question, answer) => {
    if (!question) return;

    const isAlreadySaved = questionList.some((item) => item.id === question.id);
    if (isAlreadySaved) {
      setAddMessage("この質問はすでに質問ボックスに入っています。");
      return;
    }

    const questionItem = {
      id: question.id,
      question: question.question || question.prompt,
      answer: answer || "",
      correct: question.correct || question.correctAnswer,
      explanation: question.explanation,
    };

    setQuestionList((prev) => [...prev, questionItem]);
    setAddMessage("質問ボックスに保存しました！");

    setTimeout(() => setAddMessage(""), 3000);
  };

  const handleDeleteQuestion = (index) => {
    const newList = [...questionList];
    newList.splice(index, 1);
    setQuestionList(newList);
  };

  // ========== UI ==========
  const totalQuestions = filteredQuestions.length;
  const incorrectCount = Object.keys(mistakes).length;
  const correctCount = totalQuestions - incorrectCount;
  const correctRate = Math.round((correctCount / totalQuestions) * 100);
  const incorrectQuestionsList = filteredQuestions.filter(
    (q) => mistakes[q.id]
  );
  const totalHintPenalty = Object.values(hintLevels)
    .map((level) =>
      level === 0 ? 0 : hintPenalties.slice(0, level).reduce((a, b) => a + b, 0)
    )
    .reduce((a, b) => a + b, 0);

  const adjustedCorrectRate = Math.max(0, correctRate - totalHintPenalty);

  if (!showQuestions && !showResult && units.length === 0) {
    return <div className="p-8 text-lg">読み込み中です...</div>;
  }

  return (
    <div className="min-h-screen bg-gradient-to-r from-pink-100 to-yellow-100 max-w-4xl mx-auto p-4">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">
          英語ひっかけ問題 ～塾長からの挑戦状～
        </h1>
        <button
          onClick={() => playButtonSound(() => setShowQuestionModal(true))}
          className="bg-yellow-300 hover:bg-yellow-400 text-[#4A6572] px-4 py-2 rounded-full shadow transition"
        >
          📥 質問ボックス（{questionList.length}件）
        </button>
      </div>

      {/* スタート画面 */}
      {!showQuestions && !showResult && units.length > 0 && (
        <div className="max-w-2xl mx-auto bg-[#F9F9F9] border border-[#E0E0E0] rounded-xl p-6 shadow">
          <h2 className="text-2xl font-bold text-[#4A6572] mb-4 text-center">
            単元を選んでください（緑=両方、青=選択、橙=記述）
          </h2>
          <div className="flex justify-center gap-4 mb-4">
            <button
              onClick={() => playButtonSound(() => selectAllUnits())}
              className="bg-[#A7D5C0] text-[#4A6572] px-4 py-2 rounded-full shadow-sm hover:bg-[#92C8B2] transition"
            >
              全選択
            </button>
            <button
              onClick={() => playButtonSound(() => clearAllUnits())}
              className="bg-[#F8B195] text-white px-4 py-2 rounded-full shadow-sm hover:bg-[#F49A87] transition"
            >
              全解除
            </button>
          </div>
          <div className="flex gap-3 flex-wrap justify-center mb-4">
            {units.map((unit) => {
              const mode = unitModes[unit] || 0;
              let color = "bg-white text-[#4A6572] border"; // 未選択

              if (mode === 1) color = "bg-green-400 text-white"; // 両方
              if (mode === 2) color = "bg-blue-400 text-white"; // 選択のみ
              if (mode === 3) color = "bg-orange-400 text-white"; // 記述のみ

              return (
                <button
                  key={unit}
                  onClick={() => playButtonSound(() => toggleUnitMode(unit))}
                  className={`px-4 py-2 rounded-full shadow-sm transition ${color}`}
                >
                  {unit}
                </button>
              );
            })}
          </div>
          <h2 className="text-xl font-bold text-[#4A6572] mb-2 text-center">
            出題数を選んでください
          </h2>
          <div className="flex gap-3 flex-wrap justify-center mb-4">
            {[5, 10, 15, "all"].map((count) => (
              <button
                key={count}
                onClick={() => playButtonSound(() => setQuestionCount(count))}
                className={`px-4 py-2 rounded-full border shadow-sm transition ${
                  questionCount === count
                    ? "bg-[#A7D5C0] text-[#4A6572] font-semibold"
                    : "bg-white text-[#4A6572]"
                }`}
              >
                {count === "all" ? "すべて" : `${count}問`}
              </button>
            ))}
          </div>
          {/* サウンドON/OFFボタン */}
          <div className="flex justify-center mb-4">
            <button
              onClick={() => setShowWordList(true)}
              className="bg-blue-400 hover:bg-blue-500 text-white px-4 py-2 rounded-full shadow transition"
            >
              📖 単語帳（{wordList.length}件）
            </button>

            <button
              onClick={async () => {
                // ✅ ON/OFF に関わらず、ボタンクリック時に必ず resume() を試みる
                if (audioCtx && audioCtx.state === "suspended") {
                  try {
                    await audioCtx.resume();
                    console.log("[Audio] resumed by sound button");
                  } catch (e) {
                    console.warn("[Audio] resume failed", e);
                  }
                }

                // ✅ soundEnabled の切り替え
                setSoundEnabled((prev) => !prev);
              }}
              className={`px-4 py-2 rounded-full shadow transition ${
                soundEnabled
                  ? "bg-green-400 text-white"
                  : "bg-gray-300 text-black"
              }`}
            >
              {soundEnabled ? "🔊 サウンドOFF" : "🔈 サウンドON"}
            </button>
          </div>

          <button
            onClick={() => {
              if (filtered.length === 0) {
                alert("選択した単元に問題がありません。");
                return;
              }
              initAudio();
              startQuiz();
            }}
            disabled={units.length === 0 || !questionCount}
            className={`rounded-full px-6 py-3 shadow transition mx-auto block font-bold
    ${
      units.length === 0 || !questionCount
        ? "bg-gray-400 text-white cursor-not-allowed"
        : "bg-red-500 hover:bg-red-600 text-white"
    }`}
          >
            🚀 開始
          </button>
        </div>
      )}

      {/* クイズ進行中 */}
      {showQuestions && !showResult && currentQuestion && (
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
                <div className="bg-[#6DBD98] text-white p-4 rounded-lg shadow text-center">
                  ✅ 正解です！ よくできました！
                </div>
              ) : (
                <div className="bg-[#F8B195] text-white p-4 rounded-lg shadow text-center">
                  ❌ 不正解です。
                  {!showAnswer ? (
                    <div className="mt-4">
                      <button
                        onClick={() =>
                          playButtonSound(() => setShowAnswer(true))
                        }
                        className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded shadow"
                      >
                        答えを見てみる
                      </button>
                    </div>
                  ) : (
                    <div className="mt-4">
                      <p className="font-bold mb-2">✅ 正解は：</p>
                      <p className="bg-green-100 text-gray-800 p-2 rounded">
                        {Array.isArray(currentQuestion.correct)
                          ? currentQuestion.correct.join(" / ")
                          : currentQuestion.correct}
                      </p>
                      <button
                        onClick={() =>
                          playButtonSound(() => {
                            setShowAnswer(false);
                            setShowFeedback(false);
                          })
                        }
                        className="mt-4 bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded shadow"
                      >
                        もう一度解いてみる
                      </button>
                    </div>
                  )}
                </div>
              )}

              <p className="text-gray-800 mt-2">
                あなたの答え: {selectedChoice}
              </p>

              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3 }}
                className="bg-[#F9F9F9] border-l-8 border-[#A7D5C0] rounded-xl p-6 mt-4 shadow"
              >
                <div className="flex items-center mb-2">
                  <span className="text-2xl mr-2">📘</span>
                  <h3 className="text-[#4A6572] font-bold text-lg">
                    解説をしっかり読もう！
                  </h3>
                </div>

                <p className="text-gray-800 leading-relaxed">
                  {currentQuestion.explanation}
                </p>
                <button
                  onClick={() => speakExplanation(currentQuestion.explanation)}
                  className="bg-blue-500 text-white px-4 py-2 rounded mt-2"
                >
                  🔊 解説を聞く
                </button>
              </motion.div>

              <button
                onClick={() => playButtonSound(() => handleAddToQuestionList())}
                className="bg-yellow-400 hover:bg-yellow-500 text-white px-6 py-3 rounded-full shadow-md transition mt-4"
              >
                後で先生に質問する
              </button>

              {addMessage && (
                <p className="mt-2 text-green-700 font-semibold">
                  {addMessage}
                </p>
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

              {/* 🔽 タイマー表示 */}
              <div
                className={`text-xl font-bold mb-2 ${
                  timeLeft <= 5 ? "text-red-600 animate-pulse" : "text-gray-800"
                }`}
              >
                残り時間: {timeLeft} 秒
              </div>

              {/* 🔽 残り時間バー */}
              <div className="w-full bg-gray-200 h-4 rounded mb-4">
                <div
                  className={`h-4 rounded transition-all duration-1000 ${
                    timeLeft > 5 ? "bg-green-500" : "bg-red-500 animate-pulse"
                  }`}
                  style={{
                    width: `${maxTime > 0 ? (timeLeft / maxTime) * 100 : 0}%`,
                  }}
                ></div>
              </div>

              {/* 🔽 時間切れ表示 */}
              {timeUp && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1.2 }}
                  transition={{ type: "spring", stiffness: 300 }}
                  className="text-4xl font-extrabold text-red-600 text-center my-6"
                >
                  ⏰ 時間切れ！
                </motion.div>
              )}

              <div className="bg-[#F9F9F9] border border-[#E0E0E0] rounded-xl p-6 shadow mb-6 max-w-2xl mx-auto text-left">
                <h2 className="text-xl font-bold mb-2 text-left word-break-clean whitespace-pre-wrap max-w-prose mx-auto">
                  {currentQuestion.type === "multiple-choice" && (
                    <span>
                      {currentQuestion.question.split(" ").map((word, idx) => (
                        <span
                          key={idx}
                          onClick={() => handleWordClick(word)}
                          className="hover:bg-[#A7D5C0] cursor-pointer px-1 rounded transition"
                        >
                          {word}
                        </span>
                      ))}
                    </span>
                  )}
                  {currentQuestion.type === "input" && currentQuestion.question}
                </h2>
              </div>

              {currentQuestion.type === "multiple-choice" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                  {shuffledChoices.map((choice, index) => (
                    <button
                      key={index}
                      onClick={() => handleAnswer(choice)}
                      className="bg-white border border-[#E0E0E0] rounded-lg px-4 py-3 hover:bg-[#A7D5C0] text-[#4A6572] transition shadow-sm"
                    >
                      {choice}
                    </button>
                  ))}
                </div>
              )}

              {currentQuestion.type === "input" && (
                <div className="flex flex-col gap-4 mt-4">
                  <input
                    type="text"
                    value={inputAnswer}
                    onChange={(e) => setInputAnswer(e.target.value)} // ← 直接 setInputAnswer
                    placeholder="ここに英語で入力"
                    className="border px-3 py-2 rounded w-full mb-4"
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="none" // ← iPhoneの自動大文字化も無効化
                    spellCheck={false}
                  />
                  <button
                    onClick={() => handleAnswer(inputAnswer)}
                    className="bg-[#4A6572] text-white rounded-full px-6 py-3 hover:bg-[#3F555F] transition shadow"
                  >
                    答える
                  </button>

                  {showWarning && (
                    <div className="text-red-600 font-bold mt-2">
                      ⚠ 候補入力は禁止です。1文字ずつ入力してください。
                    </div>
                  )}

                  {hintText && (
                    <div className="bg-[#F9F9F9] border border-[#E0E0E0] rounded-lg p-4 mt-2 shadow">
                      <h3 className="text-[#4A6572] font-bold mb-2">ヒント</h3>
                      <p className="text-gray-800">{hintText}</p>
                    </div>
                  )}

                  <button
                    onClick={() => playButtonSound(() => handleShowHint())}
                    disabled={hintLevel >= 3}
                    className="bg-[#A7D5C0] text-[#4A6572] rounded-full px-4 py-2 shadow hover:bg-[#92C8B2] transition"
                  >
                    {hintLevel < 3
                      ? "ヒントを見る"
                      : "これ以上ヒントはありません"}
                  </button>
                </div>
              )}

              {selectedWord && (
                <div className="mt-4 p-4 bg-[#F9F9F9] border border-[#E0E0E0] rounded-lg shadow">
                  <h3 className="text-lg font-bold text-[#4A6572] mb-2">
                    選択した単語
                  </h3>
                  <p className="text-xl text-[#4A6572]">{selectedWord}</p>
                  <p className="text-gray-800">{wordMeaning}</p>
                </div>
              )}
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
            className="bg-[#F9F9F9] border border-[#E0E0E0] rounded-2xl p-8 mb-6 text-center shadow-lg"
          >
            <h2 className="text-3xl font-bold text-[#4A6572] mb-4">結果発表</h2>
            <p className="text-6xl font-extrabold text-[#6DBD98] mb-2">
              {correctRate}%
            </p>
            <p className="text-[#4A6572]">
              ヒント利用による減点: -{totalHintPenalty}%
            </p>
            <p className="text-xl font-bold text-[#4A6572]">
              最終正答率: {adjustedCorrectRate}%
            </p>
          </motion.div>

          {incorrectQuestionsList.length > 0 && (
            <div className="mt-6">
              <h3 className="text-xl font-bold mb-2">不正解だった問題と解説</h3>
              {incorrectQuestionsList.map((q) => (
                <div key={q.id} className="mb-4 p-3 border rounded bg-red-50">
                  <p className="font-semibold">
                    問題: {q.question || q.prompt}
                  </p>
                  <p className="text-red-600">
                    あなたの答え: {firstMistakeAnswers[q.id]}
                  </p>
                  <p className="text-green-600">
                    正解: {q.correct || q.correctAnswer}
                  </p>
                  <p className="mt-1 text-gray-700 flex items-center">
                    解説: {q.explanation}
                    {q.explanation && <TTSButton text={q.explanation} />}
                    {/* ← ここに新しい質問ボタンを追加 */}
                    <button
                      onClick={() =>
                        playButtonSound(() =>
                          handleAddSpecificQuestionToList(
                            q,
                            firstMistakeAnswers[q.id]
                          )
                        )
                      }
                      className="bg-yellow-400 hover:bg-yellow-500 text-white px-3 py-1 rounded-full shadow-md transition"
                    >
                      ❓ 後で先生に質問する
                    </button>
                  </p>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-4">
            {" "}
            <button
              onClick={restartQuiz}
              className="bg-pink-400 hover:bg-pink-500 text-white px-6 py-3 rounded-full shadow-md transition"
            >
              同じ問題でもう一度
            </button>
            <button
              onClick={() => window.location.reload()}
              className="bg-pink-400 hover:bg-pink-500 text-white px-6 py-3 rounded-full shadow-md transition"
            >
              別の問題にチャレンジ
            </button>
          </div>
          {questionList.length > 0 && (
            <div className="mt-6 p-4 bg-gray-100 rounded shadow">
              <h3 className="font-bold mb-2">質問ボックス（仮表示）</h3>
              <ul className="list-disc pl-5">
                {questionList.map((item, index) => (
                  <li key={index}>
                    {item.question}（あなたの答え: {item.answer}）
                  </li>
                ))}
              </ul>
              <button
                onClick={() =>
                  playButtonSound(() => {
                    setQuestionList([]);
                    localStorage.removeItem("questionList");
                  })
                }
                className="bg-red-400 text-white px-4 py-2 rounded shadow hover:bg-red-500"
              >
                質問ボックスを全てクリア
              </button>
            </div>
          )}
        </div>
      )}

      {showWordList && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-lg w-full shadow-lg relative">
            {/* タイトル */}
            <h2 className="text-xl font-bold mb-4">📖 単語帳</h2>

            {/* ===== テスト画面 or 単語一覧 ===== */}
            {showWordTest ? (
              // ===== テスト画面 =====
              <div>
                <h2 className="text-xl font-bold mb-4">
                  {round === 1
                    ? "英→日テスト"
                    : round === 2
                    ? "日→英テスト"
                    : "復習テスト (英→日)"}{" "}
                  ({testIndex + 1}/
                  {round === 3 ? wrongWords.length : wordList.length})
                </h2>

                <p className="text-2xl mb-4">
                  👉{" "}
                  {round === 3
                    ? wrongWords[testIndex].word
                    : round === 1
                    ? testWord.word
                    : testWord.meaning}
                </p>

                <input
                  type="text"
                  value={answer}
                  onChange={handleTestInputChange}
                  placeholder={
                    round === 2 ? "英語で答えを入力" : "日本語で答えを入力"
                  }
                  className="border px-3 py-2 rounded w-full mb-4"
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                />

                {showWarning && (
                  <div className="text-red-600 font-bold mt-2">
                    ⚠ 候補入力は禁止です。1文字ずつ入力してください。
                  </div>
                )}

                <button
                  onClick={() => {
                    // ✅ 正答と入力値を正規化して比較
                    const correctAnswer =
                      round === 1
                        ? testWord.meaning // 英→日
                        : round === 2
                        ? testWord.word // 日→英
                        : wrongWords[testIndex].meaning; // ✅ 復習は英→日固定

                    const userAnswer =
                      round === 1
                        ? normJa(answer)
                        : round === 2
                        ? normEn(answer)
                        : normJa(answer); // ✅ 復習は日本語で答える

                    const corr =
                      round === 1
                        ? normJa(correctAnswer)
                        : round === 2
                        ? normEn(correctAnswer)
                        : normJa(correctAnswer);

                    if (userAnswer === corr) {
                      alert("⭕ 正解！");
                    } else {
                      alert(`❌ 不正解。正解は「${correctAnswer}」`);
                      setWrongWords((prev) => [...prev, testWord]);
                    }

                    // === 次の問題に進む処理 ===
                    const nextIndex = testIndex + 1;

                    if (
                      nextIndex <
                      (round === 3 ? wrongWords.length : wordList.length)
                    ) {
                      setTestIndex(nextIndex);
                      if (round === 3) {
                        setTestWord(wrongWords[nextIndex]); // ← 復習モード用の更新
                      } else {
                        setTestWord(wordList[nextIndex]); // ← 英→日 or 日→英用
                      }
                    } else {
                      if (round === 1) {
                        // 英→日が終わったら日→英へ
                        setRound(2);
                        setTestIndex(0);
                        setTestWord(wordList[0]);
                      } else if (round === 2) {
                        // 日→英が終わったら復習へ
                        if (wrongWords.length > 0) {
                          setRound(3);
                          setTestIndex(0);
                          setTestWord(wrongWords[0]); // ← 復習モード最初の単語
                        } else {
                          alert("✅ テスト終了！");
                          setShowWordTest(false);
                        }
                      } else {
                        // 復習モードも終了
                        alert("✅ 復習テスト終了！");
                        setShowWordTest(false);
                      }
                    }
                    setAnswer("");
                  }}
                  className="bg-purple-400 hover:bg-purple-500 text-white px-4 py-2 rounded-full shadow"
                >
                  答える
                </button>
              </div>
            ) : (
              // ===== 単語一覧 =====
              <div>
                {wordList.length === 0 ? (
                  <p className="text-gray-600">
                    まだ単語が登録されていません。
                  </p>
                ) : (
                  <ul className="list-disc pl-6 mb-4">
                    {wordList.map((w, i) => (
                      <li
                        key={i}
                        className="flex justify-between items-center mb-2"
                      >
                        <span>
                          {w.word} ― {w.meaning}
                        </span>
                        <button
                          onClick={() =>
                            setWordList((prev) =>
                              prev.filter((_, idx) => idx !== i)
                            )
                          }
                          className="ml-4 bg-red-400 hover:bg-red-500 text-white px-2 py-1 rounded"
                        >
                          削除
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                <button
                  onClick={startWordTest}
                  className="bg-green-400 hover:bg-green-500 text-white px-4 py-2 rounded-full shadow transition"
                >
                  📝 単語テスト開始（英→日 → 日→英）
                </button>
              </div>
            )}

            {/* 閉じるボタン */}
            <button
              onClick={() => setShowWordList(false)}
              className="bg-gray-400 hover:bg-gray-500 text-white px-4 py-2 rounded mt-4"
            >
              閉じる
            </button>
          </div>
        </div>
      )}

      {showQuestionModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-lg w-full shadow-lg relative">
            <h2 className="text-xl font-bold mb-4 text-center">質問ボックス</h2>

            {questionList.length === 0 ? (
              <p className="text-gray-600 text-center">
                質問はまだありません。
              </p>
            ) : (
              <ul className="space-y-4 max-h-96 overflow-y-auto">
                {questionList.map((item, index) => (
                  <li key={index} className="p-3 border rounded bg-gray-50">
                    <p className="font-semibold">{item.question}</p>
                    <p className="text-sm text-gray-600">
                      あなたの答え: {item.answer}
                    </p>
                    <p className="text-sm text-green-700">
                      正解: {item.correct}
                    </p>
                    <p className="text-sm text-gray-800 mt-1">
                      {item.explanation}
                    </p>
                    <button
                      onClick={() =>
                        playButtonSound(() => handleDeleteQuestion(index))
                      }
                      className="mt-2 bg-red-400 text-white px-3 py-1 rounded shadow hover:bg-red-500"
                    >
                      削除
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-4 flex justify-between">
              <button
                onClick={() =>
                  playButtonSound(() => setShowQuestionModal(false))
                }
                className="bg-gray-300 hover:bg-gray-400 px-4 py-2 rounded shadow"
              >
                閉じる
              </button>
              {questionList.length > 0 && (
                <button
                  onClick={() =>
                    playButtonSound(() => {
                      setQuestionList([]);
                      localStorage.removeItem("questionList");
                      setShowQuestionModal(false);
                    })
                  }
                  className="bg-red-400 text-white px-4 py-2 rounded shadow hover:bg-red-500"
                >
                  全てクリア
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
