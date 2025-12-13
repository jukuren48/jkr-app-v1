// pages/_app.js
import "@/styles/globals.css";
import { SupabaseContextProvider } from "@/src/providers/SupabaseProvider";

export default function App({ Component, pageProps }) {
  return (
    <SupabaseContextProvider>
      <Component {...pageProps} />
    </SupabaseContextProvider>
  );
}
