import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { lazy, Suspense, useEffect } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { SessionProvider, useSession } from "./context/SessionContext";
import { resolveLanguage } from "./lib/i18n";
import { applyThemeAttribute, resolveTheme } from "./lib/theme";
import { TopBar } from "./components/layout/TopBar";
import { SearchPage } from "./pages/SearchPage";
import "@fontsource-variable/geist/wght.css";
import "@fontsource-variable/geist-mono/wght.css";
import "./App.css";

const SetupWizard = lazy(() =>
  import("./pages/SetupWizard").then((m) => ({ default: m.SetupWizard })),
);
const ReviewPage = lazy(() =>
  import("./pages/ReviewPage").then((m) => ({ default: m.ReviewPage })),
);
const EmailPage = lazy(() =>
  import("./pages/EmailPage").then((m) => ({ default: m.EmailPage })),
);
const ApplyPage = lazy(() =>
  import("./pages/ApplyPage").then((m) => ({ default: m.ApplyPage })),
);
const ArchivePage = lazy(() =>
  import("./pages/ArchivePage").then((m) => ({ default: m.ArchivePage })),
);
const RolesPage = lazy(() =>
  import("./pages/RolesPage").then((m) => ({ default: m.RolesPage })),
);

function RouteFallback() {
  return <div className="loading-page">Loading…</div>;
}

function AppRoutes() {
  const { profile, loading, settings } = useSession();

  useEffect(() => {
    document.documentElement.lang = resolveLanguage(settings?.language);
  }, [settings?.language]);

  useEffect(() => {
    applyThemeAttribute(resolveTheme(settings?.theme));
  }, [settings?.theme]);

  if (loading) {
    return <div className="loading-page">Loading…</div>;
  }

  if (!profile) {
    return (
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/setup" element={<SetupWizard />} />
          <Route path="*" element={<Navigate to="/setup" replace />} />
        </Routes>
      </Suspense>
    );
  }

  if (!profile.setup_completed) {
    return (
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/setup" element={<SetupWizard />} />
          <Route path="*" element={<Navigate to="/setup" replace />} />
        </Routes>
      </Suspense>
    );
  }

  return (
    <>
      <TopBar />
      <main className="app-main">
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/" element={<SearchPage />} />
            <Route path="/review/:decisionId" element={<ReviewPage />} />
            <Route path="/email/:applicationId" element={<EmailPage />} />
            <Route path="/apply/:applicationId" element={<ApplyPage />} />
            <Route path="/archive" element={<ArchivePage />} />
            <Route path="/roles" element={<RolesPage />} />
            <Route path="/setup" element={<Navigate to="/" replace />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </main>
    </>
  );
}

function App() {
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    void getCurrentWebview()
      .clearAllBrowsingData()
      .catch(() => {
        /* browser preview / non-tauri */
      });
  }, []);

  return (
    <SessionProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </SessionProvider>
  );
}

export default App;
