// NextButtonPortal.jsx
import { createPortal } from "react-dom";

export default function NextButtonPortal({ children }) {
  if (typeof window === "undefined") return null;

  return createPortal(children, document.getElementById("next-button-root"));
}
