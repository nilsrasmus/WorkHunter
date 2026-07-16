import type { Application, ApplicationWithMeta } from "../types";

/** Handles API response whether application is nested or flattened (legacy). */
export function parseApplicationWithMeta(
  data: ApplicationWithMeta & Partial<Application>,
): ApplicationWithMeta {
  if (data.application) {
    return {
      application: data.application,
      headline: data.headline ?? "",
      employer_name: data.employer_name ?? null,
      location: data.location ?? null,
      contact_name: data.contact_name ?? null,
      af_ad_id: data.af_ad_id ?? "",
      raw_json: data.raw_json ?? "",
    };
  }

  return {
    application: {
      id: data.id!,
      profile_id: data.profile_id!,
      ad_decision_id: data.ad_decision_id!,
      tailored_resume_md: data.tailored_resume_md ?? "",
      tailored_letter_md: data.tailored_letter_md ?? "",
      email_subject: data.email_subject ?? null,
      email_body: data.email_body ?? null,
      email_to: data.email_to ?? null,
      email_cc: data.email_cc ?? null,
      email_bcc: data.email_bcc ?? null,
      gmail_draft_id: data.gmail_draft_id ?? null,
      approved_at: data.approved_at ?? null,
      sent_at: data.sent_at ?? null,
      created_at: data.created_at ?? "",
      resume_format: data.resume_format ?? null,
      letter_format: data.letter_format ?? null,
      resume_file_name: data.resume_file_name ?? null,
      letter_file_name: data.letter_file_name ?? null,
      application_method: data.application_method ?? null,
      export_path: data.export_path ?? null,
      apply_notes: data.apply_notes ?? null,
    },
    headline: data.headline ?? "",
    employer_name: data.employer_name ?? null,
    location: data.location ?? null,
    contact_name: data.contact_name ?? null,
    af_ad_id: data.af_ad_id ?? "",
    raw_json: data.raw_json ?? "",
  };
}
