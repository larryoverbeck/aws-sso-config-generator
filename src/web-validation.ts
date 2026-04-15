/**
 * Shared validation helpers for the web UI frontend logic.
 * These mirror the inline JS sanitization/validation in web-ui.ts
 * and are exported for testability (including property-based tests).
 */

/**
 * Sanitize a profile name using the same rules as `sanitizeName` in naming.ts:
 *  1. Lowercase the input
 *  2. Replace non-alphanumeric characters (except hyphens) with hyphens
 *  3. Collapse consecutive hyphens into one
 *  4. Trim leading/trailing hyphens
 */
export function sanitizeProfileName(input: string): string {
  if (!input) return '';

  return input
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Validate a set of selected profiles against existing config names
 * and each other. Returns a map of validation errors keyed by original
 * profile name.
 *
 * Error cases:
 *  - Empty sanitized name → "Profile name is required."
 *  - Sanitized name matches an existing profile → "Profile name already exists in config."
 *  - Sanitized name matches another selection's sanitized name → "Duplicate profile name."
 */
export function validateSelections(
  selections: Map<string, { customName: string }>,
  existingNames: Set<string>,
): Map<string, string> {
  const errors = new Map<string, string>();

  const entries = Array.from(selections.entries());

  for (const [key, sel] of entries) {
    const sanitized = sanitizeProfileName(sel.customName);

    if (!sanitized) {
      errors.set(key, 'Profile name is required.');
      continue;
    }

    if (existingNames.has(sanitized)) {
      errors.set(key, 'Profile name already exists in config.');
      continue;
    }

    const hasDuplicate = entries.some(
      ([otherKey, otherSel]) =>
        otherKey !== key && sanitizeProfileName(otherSel.customName) === sanitized,
    );

    if (hasDuplicate) {
      errors.set(key, 'Duplicate profile name.');
    }
  }

  return errors;
}

/**
 * Determine whether the Save button should be disabled.
 * Disabled when there are no selections or when validation errors exist.
 */
export function isSaveDisabled(selectionsSize: number, validationErrorsSize: number): boolean {
  return selectionsSize === 0 || validationErrorsSize > 0;
}
