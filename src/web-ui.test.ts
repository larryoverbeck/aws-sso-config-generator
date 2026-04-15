import { describe, it, expect } from 'vitest';
import { renderWebUI } from './web-ui.js';

// Requirements: 10.1, 10.2, 4.3

describe('renderWebUI', () => {
  const html = renderWebUI();

  it('returns valid HTML with no external CDN references', () => {
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<html');
    expect(html).toContain('</html>');
    // No external CDN links or scripts
    expect(html).not.toMatch(/https?:\/\/cdn\./);
    expect(html).not.toMatch(/https?:\/\/unpkg\.com/);
    expect(html).not.toMatch(/https?:\/\/cdnjs\./);
    expect(html).not.toMatch(/<link[^>]+href=["']https?:\/\//);
    expect(html).not.toMatch(/<script[^>]+src=["']https?:\/\//);
  });

  it('contains semantic HTML elements (headings, buttons, labels)', () => {
    expect(html).toMatch(/<h1[\s>]/);
    expect(html).toMatch(/<h2[\s>]/);
    expect(html).toMatch(/<h3[\s>]/);
    expect(html).toMatch(/<button[\s>]/);
    expect(html).toMatch(/<label[\s>]/);
    expect(html).toMatch(/<header[\s>]/);
    expect(html).toMatch(/<main[\s>]/);
    expect(html).toMatch(/<section[\s>]/);
  });

  it('contains "Production" and "Non-Production" section structure', () => {
    // The renderDiscovery JS function creates these section headings
    expect(html).toContain('Production');
    expect(html).toContain('Non-Production');
  });

  it('production profile cards include ⚠️ indicator markup', () => {
    // The JS renders ⚠️ as unicode escapes in the section heading and badge
    expect(html).toContain('\\u26a0\\ufe0f');
    // The badge class for production
    expect(html).toContain('badge-prod');
  });

  it('all form inputs have associated labels or aria-label attributes', () => {
    // Find all <textarea> and <input> elements and verify they have labels or aria-label
    const textareaMatches = html.match(/<textarea[^>]*>/g) || [];
    const inputMatches = html.match(/<input[^>]*>/g) || [];
    const staticFormElements = [...textareaMatches, ...inputMatches];

    expect(staticFormElements.length).toBeGreaterThan(0);

    for (const el of staticFormElements) {
      const hasAriaLabel = /aria-label=/.test(el);
      const hasId = /id=["']([^"']+)["']/.exec(el);
      // Either has aria-label directly, or has an id that is referenced by a <label for="...">
      if (!hasAriaLabel && hasId) {
        const labelPattern = new RegExp(`<label[^>]+for=["']${hasId[1]}["']`);
        expect(html).toMatch(labelPattern);
      } else {
        expect(hasAriaLabel).toBe(true);
      }
    }

    // Verify the dynamically generated inputs also get labels (check the JS template)
    // The renderSelectedProfiles function creates <label for="inputId"> and <input aria-label="...">
    expect(html).toContain("'<label for=\"'");
    expect(html).toContain("aria-label=\"Profile name for '");
  });
});
