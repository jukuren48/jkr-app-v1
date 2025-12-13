// pages/question-box.jsx

// ⭐ SSR と SSG を完全に禁止（build エラーを防ぐための3点セット）
export const dynamic = "error";
export const revalidate = 0;
export const fetchCache = "only-no-store";

import { useState, useEffect } from "react";

export default function QuestionBox() {
  const [questions, setQuestions] = useState([]);
  const [editingIndex, setEditingIndex] = useState(null);
  const [editingMemo, setEditingMemo] = useState("");

  // ① 初回ロード（localStorage は useEffect 内なら安全）
  useEffect(() => {
    const saved = JSON.parse(localStorage.getItem("studentQuestions") || "[]");
    setQuestions(saved);
  }, []);

  // ② 保存関数
  const saveQuestions = (newQuestions) => {
    localStorage.setItem("studentQuestions", JSON.stringify(newQuestions));
    setQuestions(newQuestions);
  };

  // ③ 削除処理
  const handleDelete = (index) => {
    if (!window.confirm("この質問を削除しますか？")) return;
    const newQuestions = [...questions];
    newQuestions.splice(index, 1);
    saveQuestions(newQuestions);
  };

  // ④ 編集モーダルを開く
  const openEditModal = (index) => {
    setEditingIndex(index);
    setEditingMemo(questions[index].studentMemo);
  };

  // ⑤ 編集保存
  const saveEdit = () => {
    const newQuestions = [...questions];
    newQuestions[editingIndex].studentMemo = editingMemo;
    saveQuestions(newQuestions);
    setEditingIndex(null);
    setEditingMemo("");
  };

  return (
    <div className="max-w-3xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4 text-[#4A6572]">質問ボックス</h1>

      {questions.length === 0 ? (
        <p>まだ質問は保存されていません。</p>
      ) : (
        questions.map((q, idx) => (
          <div
            key={idx}
            className="bg-[#F9F9F9] border border-[#E0E0E0] rounded-lg p-4 mb-4 shadow"
          >
            <p className="text-[#4A6572] font-semibold mb-2">
              問題: {q.question}
            </p>
            <p>あなたの答え: {q.studentAnswer}</p>
            <p>正解: {q.correctAnswer}</p>
            <p className="mb-2">解説: {q.explanation}</p>
            <p className="mb-2">
              あなたのメモ:{" "}
              <span className="italic">{q.studentMemo || "（未記入）"}</span>
            </p>
            <p className="text-sm text-gray-500 mb-2">
              保存日時: {new Date(q.timestamp).toLocaleString()}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => openEditModal(idx)}
                className="px-3 py-1 bg-[#A7D5C0] text-[#4A6572] rounded-full shadow hover:bg-[#92C8B2] transition"
              >
                編集
              </button>
              <button
                onClick={() => handleDelete(idx)}
                className="px-3 py-1 bg-red-300 text-white rounded-full shadow hover:bg-red-400 transition"
              >
                削除
              </button>
            </div>
          </div>
        ))
      )}

      {editingIndex !== null && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full shadow-lg">
            <h2 className="text-xl font-bold mb-4 text-[#4A6572]">
              メモを編集する
            </h2>
            <textarea
              value={editingMemo}
              onChange={(e) => setEditingMemo(e.target.value)}
              placeholder="質問メモを入力"
              className="w-full border border-[#E0E0E0] rounded-lg p-3 mb-4 focus:outline-none focus:ring-2 focus:ring-[#A7D5C0] transition"
              rows={4}
            />
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setEditingIndex(null)}
                className="px-4 py-2 rounded-full bg-gray-300 hover:bg-gray-400 transition"
              >
                キャンセル
              </button>
              <button
                onClick={saveEdit}
                className="px-4 py-2 rounded-full bg-[#A7D5C0] text-[#4A6572] shadow hover:bg-[#92C8B2] transition"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
