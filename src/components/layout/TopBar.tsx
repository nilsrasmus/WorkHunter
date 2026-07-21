import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useI18n } from "../../lib/i18n";
import { useSession } from "../../context/SessionContext";
import { applyThemeAttribute, resolveTheme } from "../../lib/theme";
import { api } from "../../lib/api";
import { ProfileMenu } from "./ProfileMenu";
import { SettingsPanel } from "./SettingsPanel";
import { IconSettings, IconMoon, IconSun } from '@tabler/icons-react'

export function TopBar() {
  const { profile, settings, refreshSettings } = useSession();
  const { t } = useI18n();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const location = useLocation();

  if (!profile) return null;

  const theme = resolveTheme(settings?.theme);

  const toggleTheme = async () => {
    if (!settings) return;
    const next = theme === "dark" ? "light" : "dark";
    applyThemeAttribute(next);
    try {
      await api.saveSettings(profile.id, { ...settings, theme: next });
      await refreshSettings();
    } catch {
      applyThemeAttribute(theme);
    }
  };

  return (
    <>
      <header className="top-bar">
        <div className="top-bar-left">
          <span className="logo">Work<span className="logo-accent">Hunter</span></span>
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
          <button type="button" className="btn-icon" onClick={toggleTheme} title={t("top.themeToggle")}>
            {theme === "dark" ? <IconSun size={18} /> : <IconMoon size={18} />}
          </button>
          <button type="button" className="btn-icon" onClick={() => setSettingsOpen(true)} title={t("settings.title")}><IconSettings size={18}/></button>
          <ProfileMenu />
        </div>
      </header>
      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  );
}
