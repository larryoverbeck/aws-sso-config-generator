// Feature: web-config-ui, Property 3: Frontend sanitization equivalence
// **Validates: Requirements 6.2**
// Feature: web-config-ui, Property 4: Duplicate profile name detection
// **Validates: Requirements 6.3**

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { sanitizeProfileName, validateSelections, isSaveDisabled } from './web-validation.js';
import { sanitizeName } from './naming.js';

describe('Property 3: Frontend sanitization equivalence', () => {
  it('sanitizeProfileName produces the same result as sanitizeName for any string', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 200 }),
        (input: string) => {
          expect(sanitizeProfileName(input)).toBe(sanitizeName(input));
        },
      ),
      { numRuns: 200 },
    );
  });
});

/**
 * Arbitrary for valid sanitized profile names (non-empty, lowercase alphanumeric with hyphens,
 * no leading/trailing/consecutive hyphens).
 */
const arbSanitizedName = fc
  .string({ minLength: 1, maxLength: 30 })
  .map((s) => sanitizeProfileName(s))
  .filter((s) => s.length > 0);

describe('Property 4: Duplicate profile name detection', () => {
  it('reports a validation error for a selected profile iff its sanitized name is empty, matches an existing name, or matches another selection', () => {
    fc.assert(
      fc.property(
        // Generate a set of existing profile names (already sanitized)
        fc.array(arbSanitizedName, { minLength: 0, maxLength: 10 }),
        // Generate selections: array of [key, customName] pairs with unique keys
        fc.array(
          fc.tuple(
            fc.uuid(),
            fc.string({ minLength: 0, maxLength: 50 }),
          ),
          { minLength: 1, maxLength: 10 },
        ),
        (existingNamesArr, selectionEntries) => {
          const existingNames = new Set(existingNamesArr);

          // Ensure unique keys by using the index-suffixed uuid
          const selections = new Map<string, { customName: string }>();
          for (const [key, customName] of selectionEntries) {
            const uniqueKey = `${key}-${selections.size}`;
            selections.set(uniqueKey, { customName });
          }

          const errors = validateSelections(selections, existingNames);

          // Verify: for each selection, check the error is correct
          const entries = Array.from(selections.entries());
          for (const [key, sel] of entries) {
            const sanitized = sanitizeProfileName(sel.customName);

            if (!sanitized) {
              // Empty sanitized name → must have error
              expect(errors.get(key)).toBe('Profile name is required.');
            } else if (existingNames.has(sanitized)) {
              // Matches existing profile → must have error
              expect(errors.get(key)).toBe('Profile name already exists in config.');
            } else {
              // Check if another selection has the same sanitized name
              const hasDuplicate = entries.some(
                ([otherKey, otherSel]) =>
                  otherKey !== key &&
                  sanitizeProfileName(otherSel.customName) === sanitized,
              );

              if (hasDuplicate) {
                expect(errors.get(key)).toBe('Duplicate profile name.');
              } else {
                // No conflict → must NOT have an error
                expect(errors.has(key)).toBe(false);
              }
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

// Feature: web-config-ui, Property 5: Save button disabled invariant
// **Validates: Requirements 7.5**

describe('Property 5: Save button disabled invariant', () => {
  it('Save button is disabled iff selections are empty or validation errors are non-empty', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100 }),
        fc.integer({ min: 0, max: 100 }),
        (selectionsSize: number, validationErrorsSize: number) => {
          const result = isSaveDisabled(selectionsSize, validationErrorsSize);
          const expected = selectionsSize === 0 || validationErrorsSize > 0;
          expect(result).toBe(expected);
        },
      ),
      { numRuns: 100 },
    );
  });
});
