const YEAR_ALIAS_TO_CANONICAL: Record<string, string> = {
  grade_4: 'grade4_primary',
  grade4: 'grade4_primary',
  fourth_primary: 'grade4_primary',

  grade_5: 'grade5_primary',
  grade5: 'grade5_primary',
  fifth_primary: 'grade5_primary',

  grade_6: 'grade6_primary',
  grade6: 'grade6_primary',
  sixth_primary: 'grade6_primary',

  prep1: 'grade1_prep',
  grade1prep: 'grade1_prep',

  prep2: 'grade2_prep',
  grade2prep: 'grade2_prep',

  prep3: 'grade3_prep',
  grade3prep: 'grade3_prep',

  sec1: 'grade1_secondary',
  grade1sec: 'grade1_secondary',

  sec2: 'grade2_secondary',
  grade2sec: 'grade2_secondary',
};

function sanitizeYear(value: string): string {
  return value.trim().toLowerCase().replace(/[-\s]/g, '_');
}

export function normalizeAcademicYear(value?: string | null): string {
  if (!value) return '';
  const sanitized = sanitizeYear(value);
  return YEAR_ALIAS_TO_CANONICAL[sanitized] || sanitized;
}

export function getAcademicYearVariants(value?: string | null): string[] {
  const canonical = normalizeAcademicYear(value);
  if (!canonical) return [];

  const variants = new Set<string>([canonical]);
  for (const [alias, mappedCanonical] of Object.entries(YEAR_ALIAS_TO_CANONICAL)) {
    if (mappedCanonical === canonical) variants.add(alias);
  }

  return Array.from(variants);
}

export function isSameAcademicYear(a?: string | null, b?: string | null): boolean {
  const na = normalizeAcademicYear(a);
  const nb = normalizeAcademicYear(b);
  if (!na || !nb) return false;
  return na === nb;
}
