import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { useEffect } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { SessionProvider, useSession } from "./context/SessionContext";
import { resolveLanguage } from "./lib/i18n";
import { TopBar } from "./components/layout/TopBar";
import { SetupWizard } from "./pages/SetupWizard";
import { SearchPage } from "./pages/SearchPage";
import { ReviewPage } from "./pages/ReviewPage";
import { EmailPage } from "./pages/EmailPage";
import { ApplyPage } from "./pages/ApplyPage";
import { ArchivePage } from "./pages/ArchivePage";
import { RolesPage } from "./pages/RolesPage";
import "@fontsource-variable/geist/wght.css";
import "@fontsource-variable/geist-mono/wght.css";
import "./App.css";

function AppRoutes() {
  const { profile, loading, settings } = useSession();

  useEffect(() => {
    document.documentElement.lang = resolveLanguage(settings?.language);
  }, [settings?.language]);

  if (loading) {
    return <div className="loading-page">Loading…</div>;
  }

  if (!profile) {
    return (
      <Routes>
        <Route path="/setup" element={<SetupWizard />} />
        <Route path="*" element={<Navigate to="/setup" replace />} />
      </Routes>
    );
  }

  if (!profile.setup_completed) {
    return (
      <Routes>
        <Route path="/setup" element={<SetupWizard />} />
        <Route path="*" element={<Navigate to="/setup" replace />} />
      </Routes>
    );
  }

  return (
    <>
      <TopBar />
      <main className="app-main">
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
