import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useI18n } from "../../lib/i18n";
import { useSession } from "../../context/SessionContext";
import { ProfileMenu } from "./ProfileMenu";
import { SettingsPanel } from "./SettingsPanel";

export function TopBar() {
  const { profile, settings } = useSession();
  const { t } = useI18n();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const location = useLocation();

  if (!profile) return null;

  return (
    <>
      <header className="top-bar">
        <div className="top-bar-left">
          <Link to="/" className="logo">WorkHunter</Link>
          <nav>
            <Link to="/" className={location.pathname === "/" ? "active" : ""}>{t("nav.search")}</Link>
            <Link to="/archive" className={location.pathname.startsWith("/archive") ? "active" : ""}>{t("nav.archive")}</Link>
            <Link to="/roles" className={location.pathname.startsWith("/roles") ? "active" : ""}>{t("nav.roles")}</Link>
          </nav>
        </div>
        <div className="top-bar-right">
          {settings?.test_mode && (
            <span className="test-banner">{t("top.testMode")}</span>
          )}
          <button type="button" className="btn-icon settings-btn" onClick={() => setSettingsOpen(true)} title="Settings">⚙</button>
          <ProfileMenu />
        </div>
      </header>
      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  );
}
