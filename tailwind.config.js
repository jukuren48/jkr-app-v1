/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  safelist: [
    // --- 既存 ---
    "bg-orange-400",
    "bg-green-400",
    "bg-blue-400",
    "bg-white",
    "text-white",
    "text-gray-800",
    "text-[#4A6572]",
    "border-gray-300",
    "border-green-300",
    "border-blue-300",
    "border-orange-300",

    // --- 追加：ログイン画面で使用する Tailwind クラス ---
    "bg-sky-500",
    "hover:bg-sky-600",
    "bg-gray-200",
    "hover:bg-gray-300",
    "text-gray-700",
    "hover:bg-gray-100",
    "shadow-md",
    "rounded-xl",

    // Google button
    "border",
    "border-gray-300",
    "bg-white",
    "hover:bg-gray-100",

    // その他ボタン関連
    "py-3",
    "font-bold",
    "w-full",
    "transition",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};
