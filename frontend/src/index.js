import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@/index.css";
import App from "@/App";
import { applySavedTheme } from "@/lib/theme";

// Paint the saved theme (default Light) before first render to avoid a flash.
applySavedTheme();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      refetchOnWindowFocus: false,
    },
  },
});

// Catches any render-time crash so the user sees a readable message on the
// app's dark theme instead of a blank white screen (important on older phones
// / WebViews). They can retry without reinstalling.
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { err: null };
  }
  static getDerivedStateFromError(err) {
    return { err };
  }
  componentDidCatch(err, info) {
    // eslint-disable-next-line no-console
    console.error("Nek Sathi crashed:", err, info);
  }
  render() {
    if (this.state.err) {
      return (
        <div style={{ minHeight: "100%", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, background: "#07070d", color: "#e8e8f5", fontFamily: "Manrope, system-ui, sans-serif" }}>
          <div style={{ maxWidth: 360, textAlign: "center" }}>
            <div style={{ width: 54, height: 54, borderRadius: 16, margin: "0 auto 16px", display: "grid", placeItems: "center", background: "linear-gradient(135deg,#e92546,#b3122f)", color: "#fff", fontSize: 26, fontWeight: 800 }}>!</div>
            <h2 style={{ margin: "0 0 8px", fontSize: 20 }}>Something went wrong</h2>
            <p style={{ margin: "0 0 18px", color: "#9a9ab5", fontSize: 14, lineHeight: 1.5 }}>
              The app hit an unexpected error. Please check your internet connection and try again.
            </p>
            <button
              onClick={() => window.location.reload()}
              style={{ background: "linear-gradient(100deg,#e92546,#b3122f)", color: "#fff", border: "none", borderRadius: 999, padding: "12px 24px", fontSize: 15, fontWeight: 700, cursor: "pointer" }}
            >
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
