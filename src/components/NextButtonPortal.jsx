// components/NextButtonPortal.jsx
import { createPortal } from "react-dom";

export default function NextButtonPortal({ onClick, disabled }) {
  if (typeof window === "undefined") return null;

  const root = document.getElementById("next-button-root");
  if (!root) return null;

  return createPortal(
    <button
      onClick={onClick}
      disabled={disabled}
      className={`
        fixed bottom-6 left-1/2 -translate-x-1/2 
        z-[9999]
        px-8 py-3 
        rounded-full 
        text-lg font-bold shadow-lg
        transition-all duration-200 
        active:scale-95
        ${
          disabled
            ? "bg-gray-400 text-white cursor-not-allowed"
            : "bg-gradient-to-r from-pink-500 to-orange-500 text-white hover:opacity-90"
        }
      `}
    >
      次へ →
    </button>,
    root
  );
}
