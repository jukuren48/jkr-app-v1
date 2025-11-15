import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

export default function AdminPage() {
  const [filterUnit, setFilterUnit] = useState("");
  const [searchText, setSearchText] = useState("");
  const [questions, setQuestions] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [editData, setEditData] = useState({});
  const [newQuestion, setNewQuestion] = useState({
    unit: "",
    question: "",
    correct: "",
    choices: ["", "", "", ""],
    explanation: "",
    incorrectExplanations: {},
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchQuestions();
  }, []);

  const fetchQuestions = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("questions")
      // Explicitly select only the columns that exist in our schema. This avoids
      // referencing non-existent columns like `prompt` or `correctAnswer` that
      // may be present in imported JSON data but not in the database.
      .select(
        "id,unit,question,choices,correct,explanation,incorrectExplanations,type"
      )
      .order("unit", { ascending: true });
    if (error) {
      console.error("読み込みエラー:", error.message);
    } else {
      setQuestions(data);
    }
    setLoading(false);
  };

  // Helper: get unique identifier for a question. In our schema, we use only the
  // numeric `id` column; there is no `uuid` column in the questions table. This
  // helper returns the `id` for a given question.
  const getIdentifier = (q) => q?.id;

  // Delete handler accepts a question object and deletes by its `id`
  const handleDelete = async (q) => {
    const identifier = getIdentifier(q);
    console.log("🛠 id passed to delete:", identifier);
    const confirmed = window.confirm("この問題を削除してもよろしいですか？");
    if (!confirmed) return;
    if (!identifier) {
      alert("削除に必要なIDが見つかりません。");
      return;
    }
    const { error } = await supabase
      .from("questions")
      .delete()
      .eq("id", identifier);
    if (error) {
      alert("削除に失敗しました: " + error.message);
    } else {
      setQuestions((prev) =>
        prev.filter((item) => getIdentifier(item) !== identifier)
      );
    }
  };

  const handleEditClick = (q) => {
    const identifier = getIdentifier(q);
    setEditingId(identifier);
    setEditData({
      id: q.id,
      unit: q.unit ?? "",
      question: q.question ?? "",
      correct: q.correct ?? "",
      choices: Array.isArray(q.choices) ? q.choices : ["", "", "", ""],
      explanation: q.explanation ?? "",
      incorrectExplanations: q.incorrectExplanations ?? {},
      primaryKey: "id",
    });
  };

  const handleCancel = () => {
    setEditingId(null);
    setEditData({});
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setEditData((prev) => ({ ...prev, [name]: value }));
  };

  const handleChoiceChange = (index, value) => {
    const updated = [...editData.choices];
    updated[index] = value;
    setEditData((prev) => ({ ...prev, choices: updated }));
  };

  const handleIncorrectExplanationChange = (choice, value) => {
    setEditData((prev) => ({
      ...prev,
      incorrectExplanations: {
        ...prev.incorrectExplanations,
        [choice]: value,
      },
    }));
  };

  const handleSave = async (identifier) => {
    console.log("🛠 id passed to save/delete:", identifier);
    // Always use the `id` column for updating, as our schema does not have `uuid`
    const pkName = "id";

    const filteredExplanations = {};
    (editData.choices || []).forEach((c) => {
      if (c !== editData.correct && editData.incorrectExplanations[c]) {
        filteredExplanations[c] = editData.incorrectExplanations[c];
      }
    });

    const { data: updateResult, error } = await supabase
      .from("questions")
      .update({
        unit: editData.unit,
        question: editData.question,
        correct: editData.correct,
        choices: editData.choices,
        explanation: editData.explanation,
        incorrectExplanations: filteredExplanations,
      })
      .eq(pkName, identifier)
      .select();

    console.log("🔄 update result:", updateResult);

    if (error) {
      alert("更新に失敗しました: " + error.message);
    } else if (
      !updateResult ||
      (Array.isArray(updateResult) && updateResult.length === 0)
    ) {
      // Even if no rows returned, treat as success to update local state
      alert(
        "更新は成功しましたが、データが見つかりません。IDが正しいか確認してください。"
      );
      setQuestions((prev) =>
        prev.map((q) =>
          getIdentifier(q) === identifier
            ? { ...q, ...editData, incorrectExplanations: filteredExplanations }
            : q
        )
      );
      setEditingId(null);
    } else {
      setQuestions((prev) =>
        prev.map((q) =>
          getIdentifier(q) === identifier
            ? { ...q, ...editData, incorrectExplanations: filteredExplanations }
            : q
        )
      );
      setEditingId(null);
    }
  };

  const handleNewChange = (e) => {
    const { name, value } = e.target;
    setNewQuestion((prev) => ({ ...prev, [name]: value }));
  };

  const handleNewChoiceChange = (index, value) => {
    const updated = [...newQuestion.choices];
    updated[index] = value;
    setNewQuestion((prev) => ({ ...prev, choices: updated }));
  };

  const handleNewIncorrectExplanationChange = (choice, value) => {
    setNewQuestion((prev) => ({
      ...prev,
      incorrectExplanations: {
        ...prev.incorrectExplanations,
        [choice]: value,
      },
    }));
  };

  const handleAdd = async () => {
    const filteredExplanations = {};
    (newQuestion.choices || []).forEach((c) => {
      if (c !== newQuestion.correct && newQuestion.incorrectExplanations[c]) {
        filteredExplanations[c] = newQuestion.incorrectExplanations[c];
      }
    });

    const { data, error } = await supabase
      .from("questions")
      .insert({
        unit: newQuestion.unit,
        question: newQuestion.question,
        correct: newQuestion.correct,
        choices: newQuestion.choices,
        explanation: newQuestion.explanation,
        incorrectExplanations: filteredExplanations,
        type: newQuestion.type || "multiple-choice",
      })
      .select();

    if (error) {
      alert("追加に失敗しました: " + error.message);
    } else {
      setQuestions((prev) => [...prev, data[0]]);
      setNewQuestion({
        unit: "",
        question: "",
        correct: "",
        choices: ["", "", "", ""],
        explanation: "",
        incorrectExplanations: {},
      });
    }
  };

  // Export current questions to a JSON file for download
  const handleExport = () => {
    try {
      const jsonString = JSON.stringify(questions, null, 2);
      const blob = new Blob([jsonString], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      // Use a fixed file name so that the exported file overwrites the existing one if desired
      a.download = "questions.json";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("エクスポート失敗:", err);
      alert("ファイルのエクスポートに失敗しました。");
    }
  };

  const handleFileImport = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const text = e.target.result;
        let items = [];

        if (file.name.endsWith(".json")) {
          items = JSON.parse(text);
        } else if (file.name.endsWith(".csv")) {
          const lines = text.split("\n");
          const headers = lines[0].split(",").map((h) => h.trim());
          items = lines
            .slice(1)
            .filter(Boolean)
            .map((line) => {
              const values = line.split(",");
              const obj = {};
              headers.forEach((key, i) => {
                obj[key] = values[i]?.trim();
              });
              // CSVでは choices や incorrectExplanations はJSON文字列前提
              if (obj.choices) obj.choices = JSON.parse(obj.choices);
              if (obj.incorrectExplanations)
                obj.incorrectExplanations = JSON.parse(
                  obj.incorrectExplanations
                );
              return obj;
            });
        }

        // Transform imported items to match the database schema. Some JSON files may use
        // different field names such as `prompt` and `correctAnswer`, which are not
        // present in our Supabase table. Here we map them into the expected
        // structure: `question` and `correct`. We also remove any extraneous
        // properties and default missing values to sensible fallbacks.
        const transformedItems = items.map((item) => {
          const isInput = item.type === "input" || item.type === "Input";
          const questionText = item.question || item.prompt || "";
          const correctValue = item.correct || item.correctAnswer || "";
          return {
            // Preserve the original `id` so that upsert can update existing rows
            id: item.id,
            unit: item.unit || "",
            question: questionText,
            correct: correctValue,
            choices: Array.isArray(item.choices)
              ? item.choices
              : isInput
              ? []
              : [],
            explanation: item.explanation || "",
            incorrectExplanations: item.incorrectExplanations || {},
            type: item.type || (isInput ? "input" : "multiple-choice"),
          };
        });

        // Use upsert with conflict target `id` to update existing rows instead of
        // creating duplicates. If an `id` from the import already exists, the
        // corresponding row will be updated; otherwise, a new row will be inserted.
        const { data, error } = await supabase
          .from("questions")
          .upsert(transformedItems, { onConflict: "id" })
          .select();
        if (error) {
          alert("インポート失敗: " + error.message);
        } else {
          const count = Array.isArray(data) ? data.length : 0;
          alert(`${count} 件インポートしました。`);
          fetchQuestions();
        }
      } catch (err) {
        console.error("読み込み失敗", err);
        alert("ファイルの読み込みに失敗しました。形式を確認してください。");
      }
    };

    reader.readAsText(file);
  };

  {
    /* 表示対象の絞り込み */
  }
  const filteredQuestions = questions.filter((q) => {
    const matchUnit = filterUnit === "" || q.unit === filterUnit;
    const search = searchText.toLowerCase();
    // Ensure values exist before calling string methods
    const questionText = q.question ? q.question.toLowerCase() : "";
    const explanationText = q.explanation ? q.explanation.toLowerCase() : "";
    const choicesArray = Array.isArray(q.choices) ? q.choices : [];
    const choicesMatch = choicesArray.some((c) =>
      (c || "").toLowerCase().includes(search)
    );
    const matchText =
      questionText.includes(search) ||
      choicesMatch ||
      explanationText.includes(search);
    return matchUnit && matchText;
  });

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">📋 英語問題一覧（先生用）</h1>

      {/* 絞り込みとインポートUI */}
      <div className="mb-6 flex flex-wrap gap-4 items-center">
        <select
          onChange={(e) => setFilterUnit(e.target.value)}
          className="border px-2 py-1"
          defaultValue=""
        >
          <option value="">すべての単元</option>
          {[...new Set(questions.map((q) => q.unit))].map((unit) => (
            <option key={unit} value={unit}>
              {unit}
            </option>
          ))}
        </select>

        <input
          type="text"
          placeholder="キーワード検索"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          className="border px-2 py-1"
        />

        <input
          type="file"
          accept=".json,.csv"
          onChange={handleFileImport}
          className="border px-2 py-1"
        />
        <button
          onClick={handleExport}
          className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded"
        >
          エクスポート
        </button>
        <button
          onClick={async () => {
            const confirmed = window.confirm(
              "本当にすべての問題を Supabase から削除してからインポートしますか？（元には戻せません）"
            );
            if (!confirmed) return;

            const { error } = await supabase
              .from("questions")
              .delete()
              .not("id", "is", null);
            if (error) {
              alert("全削除に失敗しました: " + error.message);
            } else {
              alert(
                "Supabase上のすべての問題を削除しました。次にファイルをインポートしてください。"
              );
              setQuestions([]);
            }
          }}
          className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded"
        >
          Supabase上の全問題を削除
        </button>
      </div>

      {/* 問題一覧テーブルの map を filteredQuestions.map に変更 */}

      {/* 新規追加フォーム */}
      <div className="mb-6 p-4 border border-gray-300 rounded">
        <h2 className="text-lg font-semibold mb-2">➕ 新規問題を追加</h2>
        <div className="grid grid-cols-2 gap-4">
          <input
            name="unit"
            placeholder="Unit"
            value={newQuestion.unit}
            onChange={handleNewChange}
            className="border px-2 py-1"
          />
          <input
            name="question"
            placeholder="Question"
            value={newQuestion.question}
            onChange={handleNewChange}
            className="border px-2 py-1"
          />
          <input
            name="correct"
            placeholder="Correct"
            value={newQuestion.correct}
            onChange={handleNewChange}
            className="border px-2 py-1"
          />
          <input
            name="explanation"
            placeholder="Explanation"
            value={newQuestion.explanation}
            onChange={handleNewChange}
            className="border px-2 py-1 col-span-2"
          />
          {newQuestion.choices.map((c, i) => (
            <div key={i} className="col-span-2">
              <input
                value={c}
                onChange={(e) => handleNewChoiceChange(i, e.target.value)}
                placeholder={`選択肢 ${i + 1}`}
                className="border px-2 py-1 w-full mb-1"
              />
              {c && c !== newQuestion.correct && (
                <input
                  value={newQuestion.incorrectExplanations[c] || ""}
                  onChange={(e) =>
                    handleNewIncorrectExplanationChange(c, e.target.value)
                  }
                  placeholder={`「${c}」の誤答解説`}
                  className="border px-2 py-1 w-full"
                />
              )}
            </div>
          ))}
        </div>
        <button
          onClick={handleAdd}
          className="mt-4 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded"
        >
          登録する
        </button>
      </div>

      {/* 問題一覧テーブル */}
      <table className="w-full border-collapse border border-gray-300 text-sm">
        <thead className="bg-gray-100">
          <tr>
            <th className="border px-2 py-1">Unit</th>
            <th className="border px-2 py-1">Question</th>
            <th className="border px-2 py-1">Correct</th>
            <th className="border px-2 py-1">Choices</th>
            <th className="border px-2 py-1">Explanation</th>
            <th className="border px-2 py-1">Incorrect Explanations</th>
            <th className="border px-2 py-1">操作</th>
          </tr>
        </thead>
        <tbody>
          {filteredQuestions.map((q) => {
            const rowId = getIdentifier(q);
            return (
              <tr key={rowId} className="align-top">
                {editingId === rowId ? (
                  <>
                    <td className="border px-2 py-1">
                      <input
                        name="unit"
                        value={editData.unit}
                        onChange={handleChange}
                        className="w-full border px-1"
                      />
                    </td>
                    <td className="border px-2 py-1">
                      <input
                        name="question"
                        value={editData.question}
                        onChange={handleChange}
                        className="w-full border px-1"
                      />
                    </td>
                    <td className="border px-2 py-1">
                      <input
                        name="correct"
                        value={editData.correct}
                        onChange={handleChange}
                        className="w-full border px-1"
                      />
                    </td>
                    <td className="border px-2 py-1">
                      {(editData.choices || []).map((c, i) => (
                        <div key={i}>
                          <input
                            value={c}
                            onChange={(e) =>
                              handleChoiceChange(i, e.target.value)
                            }
                            className="border px-1 w-full mb-1"
                            placeholder={`選択肢 ${i + 1}`}
                          />
                        </div>
                      ))}
                    </td>
                    <td className="border px-2 py-1">
                      <textarea
                        name="explanation"
                        value={editData.explanation}
                        onChange={handleChange}
                        className="w-full border px-1"
                      />
                    </td>
                    <td className="border px-2 py-1">
                      {(editData.choices || [])
                        .map((c, i) =>
                          c !== editData.correct ? (
                            <div key={`${rowId}-${i}`}>
                              <label className="text-xs text-gray-600">
                                {c}
                              </label>
                              <input
                                value={editData.incorrectExplanations[c] || ""}
                                onChange={(e) =>
                                  handleIncorrectExplanationChange(
                                    c,
                                    e.target.value
                                  )
                                }
                                className="border px-1 w-full mb-1"
                                placeholder={`「${c}」の解説`}
                              />
                            </div>
                          ) : null
                        )
                        .filter(Boolean)}
                    </td>
                    <td className="border px-2 py-1 text-center">
                      <button
                        onClick={() => {
                          const identifierToSave = editData.id;
                          if (!identifierToSave) {
                            alert("エラー: この問題のIDが見つかりません。");
                          } else {
                            handleSave(identifierToSave);
                          }
                        }}
                        className="bg-blue-500 text-white px-2 py-1 text-xs rounded mr-1"
                      >
                        保存
                      </button>
                      <button
                        onClick={handleCancel}
                        className="bg-gray-400 text-white px-2 py-1 text-xs rounded"
                      >
                        キャンセル
                      </button>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="border px-2 py-1">{q.unit}</td>
                    <td className="border px-2 py-1">{q.question}</td>
                    <td className="border px-2 py-1">{q.correct}</td>
                    <td className="border px-2 py-1">
                      {Array.isArray(q.choices) ? q.choices.join(", ") : ""}
                    </td>
                    <td className="border px-2 py-1">{q.explanation}</td>
                    <td className="border px-2 py-1">
                      {q.incorrectExplanations &&
                        Object.entries(q.incorrectExplanations).map(
                          ([key, value]) => (
                            <div key={key}>
                              <strong>{key}</strong>: {value}
                            </div>
                          )
                        )}
                    </td>
                    <td className="border px-2 py-1 text-center">
                      <button
                        onClick={() => handleEditClick(q)}
                        className="bg-yellow-500 text-white px-2 py-1 text-xs rounded mr-1"
                      >
                        編集
                      </button>
                      <button
                        onClick={() => {
                          const identifierToDelete = getIdentifier(q);
                          if (!identifierToDelete) {
                            alert("エラー: この問題のIDが見つかりません。");
                          } else {
                            handleDelete(q);
                          }
                        }}
                        className="bg-red-500 text-white px-2 py-1 text-xs rounded"
                      >
                        削除
                      </button>
                    </td>
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
