/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  safelist: [
    // ✅ 動的に使う色をすべて固定保護
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
  ],
  theme: { extend: {} },
  plugins: [],
};
