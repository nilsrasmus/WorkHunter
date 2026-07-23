import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { openUrl } from "@tauri-apps/plugin-opener";
import { AdPanel } from "../components/AdPanel";
import { api } from "../lib/api";
import { buildEmailSubject, generateEmailBody, hasAiApiKey } from "../lib/ai";
import { useSession } from "../context/SessionContext";

export function EmailPage() {
  const { applicationId } = useParams<{ applicationId: string }>();
  const { profile, settings } = useSession();
  const navigate = useNavigate();
  const [adJson, setAdJson] = useState<Record<string, unknown>>({});
  const [tailoredResumeMd, setTailoredResumeMd] = useState("");
  const [tailoredLetterMd, setTailoredLetterMd] = useState("");
  const [tailoredResumeHtml, setTailoredResumeHtml] = useState("");
  const [tailoredLetterHtml, setTailoredLetterHtml] = useState("");
  const [resumeAttachment, setResumeAttachment] = useState("resume.pdf");
  const [letterAttachment, setLetterAttachment] = useState("personal_letter.pdf");
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [realTo, setRealTo] = useState("");
  const [draftId, setDraftId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      if (!applicationId || !settings) return;
      setLoading(true);
      try {
        const data = await api.getApplication(Number(applicationId));
        const ad = JSON.parse(data.raw_json) as Record<string, unknown>;
        setAdJson(ad);
        setTailoredResumeMd(data.application.tailored_resume_md);
        setTailoredLetterMd(data.application.tailored_letter_md);
        setTailoredResumeHtml(data.application.tailored_resume_html);
        setTailoredLetterHtml(data.application.tailored_letter_html);
        const resumeFmt = data.application.resume_format ?? "html";
        const letterFmt = data.application.letter_format ?? "html";
        setResumeAttachment(
          data.application.resume_file_name
            ?? ((resumeFmt === "markdown" || resumeFmt === "html") ? "resume.pdf" : "resume"),
        );
        setLetterAttachment(
          data.application.letter_file_name
            ?? ((letterFmt === "markdown" || letterFmt === "html") ? "personal_letter.pdf" : "personal_letter"),
        );

        const employer = data.employer_name ?? "";
        const contact = data.contact_name ?? "";
        const headline = data.headline;

        const appEmail =
          (ad.application_details as { email?: string })?.email ?? "";
        setRealTo(appEmail);
        setTo(appEmail);

        const subj = buildEmailSubject(headline, employer);
        setSubject(data.application.email_subject ?? subj);

        if (data.application.email_body) {
          setBody(data.application.email_body);
        } else if (hasAiApiKey(settings)) {
          const generated = await generateEmailBody(
            settings,
            data.raw_json,
            employer,
            contact,
            headline,
          );
          setBody(generated);
        }
      } catch (e) {
        setError(String(e));
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [applicationId, settings]);

  const createDraft = async () => {
    if (!profile || !settings || !applicationId) return;
    setCreating(true);
    setError("");
    try {
      await api.approveApplication(
        Number(applicationId),
        subject,
        body,
        to,
        cc,
        bcc,
        tailoredResumeMd,
        tailoredLetterMd,
        tailoredResumeHtml,
        tailoredLetterHtml,
      );
      const result = await api.createGmailDraft({
        profile_id: profile.id,
        application_id: Number(applicationId),
        to,
        cc,
        bcc,
        subject,
        body,
        test_mode: settings.test_mode,
        test_email: settings.test_email,
      });
      await api.setGmailDraftId(Number(applicationId), result.draft_id);
      setDraftId(result.draft_id);
      if (settings.test_mode) {
        setTo(result.actual_to);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setCreating(false);
    }
  };

  const openDraft = () => {
    if (draftId) {
      openUrl(`https://mail.google.com/mail/u/0/#drafts/${draftId}`);
    }
  };

  const markSent = async () => {
    if (!applicationId) return;
    await api.markApplicationSent(Number(applicationId));
    navigate("/archive");
  };

  if (loading) return <div className="page loading-page"><p>Preparing email…</p></div>;

  return (
    <div className="page email-page">
      <div className="page-header">
        <button type="button" className="btn btn-secondary" onClick={() => navigate(-1)}>← Back</button>
        <h1>Email preparation</h1>
      </div>

      {settings?.test_mode && (
        <div className="test-mode-notice">
          TEST MODE — draft will be sent to <strong>{settings.test_email || "your test email"}</strong>
          {realTo && <> (real recipient: {realTo})</>}
        </div>
      )}

      {error && <p className="error-msg">{error}</p>}

      <div className="email-layout">
        <div className="email-ad">
          <AdPanel ad={adJson} />
        </div>
        <div className="email-form">
          <label>To <input value={to} onChange={(e) => setTo(e.target.value)} /></label>
          <label>CC <input value={cc} onChange={(e) => setCc(e.target.value)} /></label>
          <label>BCC <input value={bcc} onChange={(e) => setBcc(e.target.value)} /></label>
          <label>Subject <input value={subject} onChange={(e) => setSubject(e.target.value)} /></label>
          <label>Body <textarea rows={10} value={body} onChange={(e) => setBody(e.target.value)} /></label>
          <p className="hint">
            Attachments: {resumeAttachment} and {letterAttachment}
          </p>
          <div className="email-actions">
            <button type="button" className="btn btn-primary" onClick={createDraft} disabled={creating}>
              {creating ? "Creating draft…" : "Create Gmail draft"}
            </button>
            {draftId && (
              <button type="button" className="btn btn-secondary" onClick={openDraft}>Open draft in Gmail</button>
            )}
            {draftId && (
              <button type="button" className="btn btn-primary" onClick={markSent}>Mark as sent</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
