import { XMLValidator } from 'fast-xml-parser';
import { parseHTML } from 'linkedom';

/**
 * Structural assertion helper (task 1.5, REQ QLT-003).
 *
 * Two responsibilities, deliberately backed by two different libraries:
 *
 *  - **Well-formedness** is checked by `fast-xml-parser`'s validator. `linkedom`
 *    cannot do this: it is an HTML-lenient parser and silently accepts unclosed
 *    tags, mismatched tags, unquoted attributes, and bare `&`, reporting no
 *    error and producing a plausible-looking document. Measured in task 1.5.
 *  - **Querying** (ids, references) is done with `linkedom`, which gives real
 *    `querySelector` semantics without launching a browser.
 *
 * The helper reports every violation it finds rather than throwing on the
 * first, so a failing sweep names all the problems at once.
 */

export interface StructuralViolation {
  kind: 'not-well-formed' | 'duplicate-id' | 'dangling-reference';
  detail: string;
}

export interface StructuralReport {
  valid: boolean;
  violations: StructuralViolation[];
  /** Ids seen in the document, in document order. Empty when not well-formed. */
  ids: string[];
  /** Internal `#target` references seen. Empty when not well-formed. */
  references: string[];
}

/**
 * Attributes whose value may be a bare `#id` reference. Only the href family
 * uses that form; a bare `#` elsewhere is a colour (`stroke="#fff"`), not a
 * reference, and treating it as one produces false dangling-reference reports.
 */
const HREF_ATTRIBUTES = ['href', 'xlink:href'] as const;

/**
 * Attributes that reference an element only through the funcIRI `url(#id)`
 * form. Paint attributes belong here precisely because their non-funcIRI
 * values are colours.
 */
const FUNC_IRI_ATTRIBUTES = [
  'fill',
  'stroke',
  'clip-path',
  'mask',
  'filter',
  'marker-start',
  'marker-mid',
  'marker-end',
] as const;

const FUNC_IRI = /^url\(["']?#([^"')]+)["']?\)$/;

function hrefReference(value: string): string | null {
  const trimmed = value.trim();

  return trimmed.startsWith('#') ? trimmed.slice(1) : null;
}

function funcIriReference(value: string): string | null {
  return FUNC_IRI.exec(value.trim())?.[1] ?? null;
}

/**
 * Parse `svg` and assert the QLT-003 invariants: the document is well-formed,
 * every id is unique, and every internal reference resolves to an element that
 * exists in the same document.
 */
export function inspectStructure(svg: string): StructuralReport {
  const violations: StructuralViolation[] = [];

  const wellFormed = XMLValidator.validate(svg);

  if (wellFormed !== true) {
    violations.push({
      kind: 'not-well-formed',
      detail: wellFormed.err.msg,
    });

    return { valid: false, violations, ids: [], references: [] };
  }

  const { document } = parseHTML(`<html><body>${svg}</body></html>`);

  const ids: string[] = [];
  const seen = new Set<string>();
  const references: string[] = [];

  for (const element of document.querySelectorAll('*')) {
    const id = element.getAttribute('id');

    if (id !== null) {
      ids.push(id);

      if (seen.has(id)) {
        violations.push({
          kind: 'duplicate-id',
          detail: `id "${id}" is used more than once`,
        });
      }

      seen.add(id);
    }

    for (const attribute of HREF_ATTRIBUTES) {
      const value = element.getAttribute(attribute);
      const target = value === null ? null : hrefReference(value);

      if (target !== null) {
        references.push(target);
      }
    }

    for (const attribute of FUNC_IRI_ATTRIBUTES) {
      const value = element.getAttribute(attribute);
      const target = value === null ? null : funcIriReference(value);

      if (target !== null) {
        references.push(target);
      }
    }
  }

  for (const target of references) {
    if (!seen.has(target)) {
      violations.push({
        kind: 'dangling-reference',
        detail: `reference "#${target}" does not resolve to any element`,
      });
    }
  }

  return { valid: violations.length === 0, violations, ids, references };
}

/** Throwing wrapper for use inside tests that expect a valid scene. */
export function assertStructure(svg: string): void {
  const report = inspectStructure(svg);

  if (!report.valid) {
    const detail = report.violations
      .map((violation) => `  - [${violation.kind}] ${violation.detail}`)
      .join('\n');

    throw new Error(`Structural assertions failed:\n${detail}`);
  }
}
