pub const DEFAULT_TAILOR_PROMPT: &str = r#"You are an expert career coach and professional CV writer. Your task is to tailor a candidate's base resume and personal letter to perfectly align with a specific job ad, making the candidate stand out as the ideal match.

Analyze the job ad to identify:
1. The top 3-4 core requirements (skills, traits, experiences).
2. The tone of voice (e.g., warm and personal, highly professional, or energetic).
3. Specific keywords and terminology used (e.g., "brukare" vs "omsorgstagare").

Adapt the base resume and base personal letter using the following guidelines:

### 1. ACTIVE TAILORING (Do this to make it match):
- Reframing & Angle: Rewrite the professional summary (profile) and the introductory paragraphs of the letter to directly address the core needs of the job ad.
- Prioritization: Reorder bullet points in the resume so that the most relevant experiences for this specific ad appear first.
- Terminology Alignment: Update verbs and nouns to match the ad's vocabulary (e.g., if the ad asks for "självständigt arbete" and the resume says "arbetade själv", update it to "självständigt arbete").
- Highlight Transferable Skills: If the ad values a trait the candidate has but hasn't highlighted enough, explicitly connect the candidate's actual background to this need.
- Tone Matching: Adjust the writing style of the personal letter to mirror the tone of the job ad.
- Placeholders: Replace [Company Name], [Contact Person], or [Role] with the actual values from the job ad when available.

### 2. STRICT GUARDRAILS (Factual Integrity):
- No Fabrication: Never invent employers, job titles, roles, schools, degrees, certifications, or dates.
- No Metric Inflation: Keep all numbers, years of experience, and dates exactly as they are in the base documents. If the base document says "10 years of experience", never change it to "12 years", "20 years", or "decades".
- Grounded Achievements: You can make achievements sound impactful and professional, but never exaggerate results or claim ownership of projects/tasks not mentioned in the base documents.
- Keep the same language as the base documents (Swedish or English)."#;

pub const DEFAULT_EMAIL_NOTE_PROMPT: &str = r#"Write a short, professional email body for a job application.

Use the email template as a starting point and personalize it for this job ad.
Keep it concise (3-5 sentences). Use the same language as the template.

Respond with plain text only — the email body, no subject line, no JSON."#;

pub const DEFAULT_EMAIL_TEMPLATE: &str = r#"Hej{{contact_name}},

Jag söker tjänsten som {{job_title}} hos {{company}}. Bifogat finner ni mitt CV och personliga brev.

Jag ser fram emot att höra från er.

Med vänliga hälsningar,
{{your_name}}"#;

pub fn default_applications_export_dir() -> String {
    dirs::document_dir()
        .map(|p| p.join("WorkHunter").join("Applications"))
        .map(|p| p.to_string_lossy().into_owned())
        .unwrap_or_else(|| ".".into())
}

pub fn default_settings() -> Vec<(&'static str, &'static str)> {
    vec![
        ("ai_provider", "gemini"),
        ("gemini_api_key", ""),
        ("gemini_model", "gemini-2.0-flash"),
        ("anthropic_api_key", ""),
        ("anthropic_model", "claude-sonnet-4-5"),
        ("test_mode", "true"),
        ("test_email", ""),
        ("prompt_tailor_docs", DEFAULT_TAILOR_PROMPT),
        ("prompt_email_note", DEFAULT_EMAIL_NOTE_PROMPT),
        ("email_body_template", DEFAULT_EMAIL_TEMPLATE),
        ("your_name", ""),
        ("applications_export_dir", ""),
        ("theme", "light"),
    ]
}
