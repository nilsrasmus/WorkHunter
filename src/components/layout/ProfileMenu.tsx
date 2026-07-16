import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../lib/api";
import { useI18n } from "../../lib/i18n";
import { useSession } from "../../context/SessionContext";

export function ProfileMenu() {
  const { profile, setProfile } = useSession();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  if (!profile) return null;

  const switchAccount = async () => {
    setOpen(false);
    try {
      const p = await api.startGoogleAuth();
      setProfile(p);
      if (!p.setup_completed) navigate("/setup");
      else navigate("/");
    } catch (e) {
      alert(String(e));
    }
  };

  const logout = async () => {
    setOpen(false);
    await api.logout();
    setProfile(null);
    navigate("/setup");
  };

  return (
    <div className="profile-menu">
      <button type="button" className="profile-btn" onClick={() => setOpen(!open)}>
        {profile.avatar_url ? (
          <img src={profile.avatar_url} alt="" className="avatar" />
        ) : (
          <span className="avatar-placeholder">{profile.display_name[0]}</span>
        )}
        <span className="profile-email">{profile.email}</span>
      </button>
      {open && (
        <>
          <div className="menu-backdrop" onClick={() => setOpen(false)} />
          <div className="dropdown-menu">
            <button type="button" onClick={() => { setOpen(false); navigate("/roles"); }}>{t("menu.roles")}</button>
            <button type="button" onClick={switchAccount}>{t("menu.switchAccount")}</button>
            <hr />
            <button type="button" className="logout-btn" onClick={logout}>{t("menu.logout")}</button>
          </div>
        </>
      )}
    </div>
  );
}
