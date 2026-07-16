import type { Role, RoleWithDocs } from "../types";

/** Handles API response whether role is nested or flattened (legacy). */
export function parseRoleWithDocs(data: RoleWithDocs & Partial<Role>): RoleWithDocs {
  if (data.role) {
    return {
      role: data.role,
      resume: data.resume ?? "",
      letter: data.letter ?? "",
    };
  }
  return {
    role: {
      id: data.id!,
      profile_id: data.profile_id!,
      name: data.name!,
      prompt_tailor_docs: data.prompt_tailor_docs ?? null,
      created_at: data.created_at!,
      updated_at: data.updated_at!,
    },
    resume: data.resume ?? "",
    letter: data.letter ?? "",
  };
}
