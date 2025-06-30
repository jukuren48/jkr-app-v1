// pages/test.js
export default function TestPage() {
  return (
    <div>
      <h1>テストページ</h1>
      <button
        onClick={async () => {
          const res = await fetch("/api/questions");
          const data = await res.json();
          console.log("📦 questions:", data);
          alert(`問題数: ${data.length}`);
        }}
      >
        API呼び出しテスト
      </button>
    </div>
  );
}
