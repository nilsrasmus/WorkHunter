pub const DEFAULT_TAILOR_PROMPT: &str = r#"You are a professional career coach helping tailor job application documents for a specific job ad.

Given the base resume and personal letter for the role "{{role_name}}", adapt them to better match the job ad below.

Rules:
- Factual accuracy is mandatory. Every claim in the output must be true according to the base resume and base personal letter.
- Never invent employers, job titles, degrees, certifications, dates, skills, or achievements.
- Never change numbers: years of experience, counts, percentages, team sizes, budgets, or tenure must match the base documents exactly (e.g. 10 years must stay 10 years — never 20, never rounded up, never vague inflation like "two decades").
- Never exaggerate, boast, or imply more experience or seniority than the base documents support.
- You may rephrase and reorder content, and emphasize relevant experience — but only by highlighting what is already true in the base documents.
- Incorporate relevant keywords from the ad naturally, without adding false qualifications.
- Replace placeholders like [Company Name] or [Contact Person] with actual values from the ad when available.
- Keep the same language as the base documents (Swedish or English).
- Output valid JSON only, no markdown fences.

Job ad (JSON):
{{ad_json}}

Base resume:
{{base_resume}}

Base personal letter:
{{base_letter}}

Respond with JSON: {"resume": "...markdown...", "letter": "...markdown..."}"#;

pub const DEFAULT_EMAIL_NOTE_PROMPT: &str = r#"Write a short, professional email body for a job application.

Use the email template as a starting point and personalize it for this job ad.
Keep it concise (3-5 sentences). Use the same language as the template.

Email template:
{{email_template}}

Company: {{company}}
Contact person: {{contact_name}}
Job title: {{job_title}}

Job ad context (JSON):
{{ad_json}}

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
    ]
}
