export interface Profile {
  id: number;
  google_sub: string;
  email: string;
  display_name: string;
  avatar_url: string | null;
  setup_completed: boolean;
}

export interface Role {
  id: number;
  profile_id: number;
  name: string;
  prompt_tailor_docs: string | null;
  created_at: string;
  updated_at: string;
}

export interface RoleWithDocs {
  role: Role;
  resume: string;
  letter: string;
}

export type DocumentFormat = "markdown" | "docx" | "pdf";

export interface RoleDocumentVersion {
  id: number;
  role_id: number;
  doc_type: "resume" | "letter";
  name: string;
  format: DocumentFormat;
  content_md: string;
  file_name: string | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export type AiProvider = "gemini" | "anthropic";

export type AppLanguage = "sv" | "en";

export type AppTheme = "light" | "dark";

export interface ProfileSettings {
  ai_provider: AiProvider;
  gemini_api_key: string;
  gemini_model: string;
  anthropic_api_key: string;
  anthropic_model: string;
  test_mode: boolean;
  test_email: string;
  prompt_tailor_docs: string;
  prompt_email_note: string;
  email_body_template: string;
  your_name: string;
  language: AppLanguage;
  applications_export_dir: string;
  theme: AppTheme;
}

export type ApplicationMethod = "email" | "external_url" | "via_af" | "unknown";

export interface JobAdHit {
  id: string;
  headline: string;
  employer?: { name?: string };
  workplace_address?: {
    city?: string;
    municipality?: string;
    region?: string;
  };
  publication_date?: string;
  description?: { text?: string };
  application_details?: {
    email?: string;
    url?: string;
    via_af?: boolean;
  };
  application_contacts?: ApplicationContact | ApplicationContact[];
  occupation?: { label?: string };
  employment_type?: { label?: string };
  working_hours_type?: { label?: string };
  experience_required?: boolean;
  label?: string[];
}

export interface ApplicationContact {
  name?: string;
  email?: string;
  telephone?: string;
  description?: string;
}

export interface SearchFilters {
  q?: string;
  "published-after"?: string;
  "published-before"?: string;
  "occupation-name"?: string[];
  "occupation-group"?: string[];
  "occupation-field"?: string[];
  "occupation-collection"?: string[];
  skill?: string[];
  language?: string[];
  "worktime-extent"?: string[];
  "parttime.min"?: number;
  "parttime.max"?: number;
  "driving-license-required"?: boolean;
  "driving-license"?: string[];
  "employment-type"?: string[];
  experience?: boolean;
  municipality?: string[];
  region?: string[];
  country?: string[];
  "unspecified-sweden-workplace"?: boolean;
  abroad?: boolean;
  remote?: boolean;
  open_for_all?: boolean;
  trainee?: boolean;
  larling?: boolean;
  franchise?: boolean;
  "hire-work-place"?: boolean;
  position?: string[];
  "position.radius"?: number[];
  employer?: string[];
  qfields?: string[];
  duration?: string[];
  "relevance-threshold"?: number;
  label?: string[];
  limit?: number;
  offset?: number;
  sort?: string;
}

export interface AdDecision {
  id: number;
  profile_id: number;
  job_ad_id: number;
  role_id: number;
  status: string;
  decided_at: string;
  resume_version_id: number | null;
  letter_version_id: number | null;
  tailor_resume: boolean;
  tailor_letter: boolean;
  application_method?: ApplicationMethod | null;
}

export interface Application {
  id: number;
  profile_id: number;
  ad_decision_id: number;
  tailored_resume_md: string;
  tailored_letter_md: string;
  email_subject: string | null;
  email_body: string | null;
  email_to: string | null;
  email_cc: string | null;
  email_bcc: string | null;
  gmail_draft_id: string | null;
  approved_at: string | null;
  sent_at: string | null;
  created_at: string;
  resume_format: DocumentFormat | null;
  letter_format: DocumentFormat | null;
  resume_file_name: string | null;
  letter_file_name: string | null;
  application_method?: ApplicationMethod | null;
  export_path?: string | null;
  apply_notes?: string | null;
}

export interface ApplicationWithMeta {
  application: Application;
  headline: string;
  employer_name: string | null;
  location: string | null;
  contact_name: string | null;
  af_ad_id: string;
  raw_json: string;
}

export interface SearchPreset {
  id: number;
  profile_id: number;
  role_id: number | null;
  name: string;
  filters_json: string;
  created_at: string;
}
