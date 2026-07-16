import { invoke } from "@tauri-apps/api/core";
import { parseApplicationWithMeta } from "./applications";
import type {
  AdDecision,
  Application,
  ApplicationWithMeta,
  DocumentFormat,
  Profile,
  ProfileSettings,
  Role,
  RoleDocumentVersion,
  RoleWithDocs,
  SearchFilters,
  SearchPreset,
} from "../types";

export const api = {
  getSession: () => invoke<{ profile: Profile | null }>("get_session"),
  logout: () => invoke<void>("logout"),
  completeSetup: (profileId: number) =>
    invoke<void>("complete_setup", { profileId }),
  startGoogleAuth: () => invoke<Profile>("start_google_auth"),

  listRoles: (profileId: number) =>
    invoke<Role[]>("list_roles", { profileId }),
  getRole: (roleId: number) => invoke<RoleWithDocs>("get_role", { roleId }),
  createRole: (profileId: number, name: string) =>
    invoke<Role>("create_role", { profileId, name }),
  updateRoleName: (roleId: number, name: string) =>
    invoke<void>("update_role_name", { roleId, name }),
  updateRoleDocument: (roleId: number, docType: string, contentMd: string) =>
    invoke<void>("update_role_document", { roleId, docType, contentMd }),
  deleteRole: (roleId: number) => invoke<void>("delete_role", { roleId }),
  saveRoleTailorPrompt: (roleId: number, prompt: string) =>
    invoke<Role>("save_role_tailor_prompt", { roleId, prompt }),
  clearRoleTailorPrompt: (roleId: number) =>
    invoke<Role>("clear_role_tailor_prompt", { roleId }),

  listRoleDocumentVersions: (roleId: number, docType?: "resume" | "letter") =>
    invoke<RoleDocumentVersion[]>("list_role_document_versions", { roleId, docType }),
  getRoleDocumentVersion: (versionId: number) =>
    invoke<RoleDocumentVersion>("get_role_document_version", { versionId }),
  createRoleDocumentMarkdown: (
    roleId: number,
    docType: "resume" | "letter",
    name: string,
    contentMd: string,
    setDefault: boolean,
  ) =>
    invoke<RoleDocumentVersion>("create_role_document_markdown", {
      roleId,
      docType,
      name,
      contentMd,
      setDefault,
    }),
  updateRoleDocumentMarkdown: (versionId: number, contentMd: string) =>
    invoke<RoleDocumentVersion>("update_role_document_markdown", { versionId, contentMd }),
  uploadRoleDocumentFile: (
    roleId: number,
    docType: "resume" | "letter",
    name: string,
    format: "docx" | "pdf",
    fileName: string,
    fileBase64: string,
  ) =>
    invoke<RoleDocumentVersion>("upload_role_document_file", {
      roleId,
      docType,
      name,
      format,
      fileName,
      fileBase64,
    }),
  renameRoleDocumentVersion: (versionId: number, name: string) =>
    invoke<RoleDocumentVersion>("rename_role_document_version", { versionId, name }),
  setDefaultRoleDocumentVersion: (versionId: number) =>
    invoke<RoleDocumentVersion>("set_default_role_document_version", { versionId }),
  deleteRoleDocumentVersion: (versionId: number) =>
    invoke<void>("delete_role_document_version", { versionId }),

  getSettings: (profileId: number) =>
    invoke<ProfileSettings>("get_settings", { profileId }),
  saveSettings: (profileId: number, settings: ProfileSettings) =>
    invoke<void>("save_settings", { profileId, settings }),
  resetPrompt: (profileId: number, promptKey: string) =>
    invoke<string>("reset_prompt", { profileId, promptKey }),
  clearWorkflowData: (profileId: number) =>
    invoke<void>("clear_workflow_data", { profileId }),
  getDefaultPrompts: () =>
    invoke<Record<string, string>>("get_default_prompts"),

  jobsearchSearch: (params: SearchFilters) =>
    invoke<{ hits: unknown[]; total: { value: number } }>("jobsearch_search", {
      params: { params: params as Record<string, unknown> },
    }),
  jobsearchGetAd: (adId: string) =>
    invoke<Record<string, unknown>>("jobsearch_get_ad", { adId }),
  jobsearchComplete: (q: string, limit?: number) =>
    invoke<unknown>("jobsearch_complete", { q, limit }),
  taxonomySearch: (query: string, taxonomyType?: string) =>
    invoke<unknown>("taxonomy_search", { query, taxonomyType }),
  taxonomyListConcepts: (
    conceptType: string,
    query?: string,
    limit?: number,
  ) =>
    invoke<{ id: string; label: string; type: string }[]>("taxonomy_list_concepts", {
      conceptType,
      query,
      limit,
    }),
  taxonomySwedishRegions: () =>
    invoke<{ id: string; label: string }[]>("taxonomy_swedish_regions"),
  taxonomyMunicipalitiesForRegions: (regionIds: string[]) =>
    invoke<{ id: string; label: string }[]>("taxonomy_municipalities_for_regions", {
      regionIds,
    }),

  listSearchPresets: (profileId: number, roleId?: number) =>
    invoke<SearchPreset[]>("list_search_presets", { profileId, roleId }),
  saveSearchPreset: (
    profileId: number,
    roleId: number | null,
    name: string,
    filtersJson: string,
  ) =>
    invoke<SearchPreset>("save_search_preset", {
      profileId,
      roleId,
      name,
      filtersJson,
    }),
  deleteSearchPreset: (presetId: number) =>
    invoke<void>("delete_search_preset", { presetId }),
  getProcessedAdIds: (profileId: number) =>
    invoke<string[]>("get_processed_ad_ids", { profileId }),

  rejectAd: (profileId: number, roleId: number, adJson: string) =>
    invoke<void>("reject_ad", { profileId, roleId, adJson }),
  proceedAd: (
    profileId: number,
    roleId: number,
    adJson: string,
    resumeVersionId: number | null,
    letterVersionId: number | null,
    tailorResume: boolean,
    tailorLetter: boolean,
  ) =>
    invoke<AdDecision>("proceed_ad", {
      profileId,
      roleId,
      adJson,
      resumeVersionId,
      letterVersionId,
      tailorResume,
      tailorLetter,
    }),
  getDecisionWithAd: (decisionId: number) =>
    invoke<[AdDecision, unknown]>("get_decision_with_ad", { decisionId }),

  saveApplication: (req: {
    profileId: number;
    adDecisionId: number;
    tailoredResumeMd: string;
    tailoredLetterMd: string;
    resumeFormat?: DocumentFormat | null;
    letterFormat?: DocumentFormat | null;
    resumeFileName?: string | null;
    letterFileName?: string | null;
  }) =>
    invoke<Application>("save_application", {
      req: {
        profile_id: req.profileId,
        ad_decision_id: req.adDecisionId,
        tailored_resume_md: req.tailoredResumeMd,
        tailored_letter_md: req.tailoredLetterMd,
        resume_format: req.resumeFormat ?? null,
        letter_format: req.letterFormat ?? null,
        resume_file_name: req.resumeFileName ?? null,
        letter_file_name: req.letterFileName ?? null,
      },
    }),
  getApplication: async (applicationId: number) =>
    parseApplicationWithMeta(
      await invoke<ApplicationWithMeta & Partial<Application>>("get_application", {
        applicationId,
      }),
    ),
  getApplicationByDecision: (decisionId: number) =>
    invoke<Application | null>("get_application_by_decision", { decisionId }),
  approveApplication: (
    applicationId: number,
    emailSubject: string,
    emailBody: string,
    emailTo: string,
    emailCc: string,
    emailBcc: string,
    tailoredResumeMd: string,
    tailoredLetterMd: string,
  ) =>
    invoke<void>("approve_application", {
      applicationId,
      emailSubject,
      emailBody,
      emailTo,
      emailCc,
      emailBcc,
      tailoredResumeMd,
      tailoredLetterMd,
    }),
  markApplicationSent: (applicationId: number) =>
    invoke<void>("mark_application_sent", { applicationId }),
  exportApplicationPackage: (profileId: number, applicationId: number) =>
    invoke<{ export_path: string }>("export_application_package", { profileId, applicationId }),
  saveApplyNotes: (applicationId: number, applyNotes: string) =>
    invoke<void>("save_apply_notes", { applicationId, applyNotes }),
  setGmailDraftId: (applicationId: number, draftId: string) =>
    invoke<void>("set_gmail_draft_id", { applicationId, draftId }),
  searchArchive: async (profileId: number, query: string) => {
    const results = await invoke<(ApplicationWithMeta & Partial<Application>)[]>(
      "search_archive",
      { profileId, query },
    );
    return results.map(parseApplicationWithMeta);
  },
  listInProgress: (profileId: number) =>
    invoke<[number, string, string][]>("list_in_progress", { profileId }),

  createGmailDraft: (req: {
    profile_id: number;
    application_id: number;
    to: string;
    cc: string;
    bcc: string;
    subject: string;
    body: string;
    test_mode: boolean;
    test_email: string;
  }) =>
    invoke<{ draft_id: string; actual_to: string; actual_cc: string; actual_bcc: string }>(
      "create_gmail_draft",
      { req },
    ),

  daysUntilRetention: (sentAt: string) =>
    invoke<number>("days_until_retention", { sentAt }),
};
