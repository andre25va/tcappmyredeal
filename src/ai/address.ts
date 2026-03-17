export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildAddressVariants(address: string): string[] {
  const base = normalizeText(address);
  const variants = new Set<string>();
  variants.add(base);

  // Street-only (first part before comma)
  const street = base.split(",")[0]?.trim();
  if (street) variants.add(street);

  // Common abbreviation swaps
  const swaps: [string, string][] = [
    ["street", "st"],
    ["avenue", "ave"],
    ["boulevard", "blvd"],
    ["drive", "dr"],
    ["court", "ct"],
    ["lane", "ln"],
    ["road", "rd"],
    ["place", "pl"],
    ["circle", "cir"],
    ["highway", "hwy"],
    ["parkway", "pkwy"],
    ["terrace", "ter"],
    ["north", "n"],
    ["south", "s"],
    ["east", "e"],
    ["west", "w"],
  ];

  const current = Array.from(variants);
  for (const v of current) {
    for (const [long, short] of swaps) {
      if (v.includes(long)) variants.add(v.replace(long, short));
      if (v.includes(short)) {
        const regex = new RegExp(`\\b${short}\\b`);
        if (regex.test(v)) variants.add(v.replace(regex, long));
      }
    }
  }

  return Array.from(variants).filter(Boolean);
}

export function includesAny(text: string, variants: string[]): string[] {
  const norm = normalizeText(text);
  return variants.filter((v) => norm.includes(normalizeText(v)));
}
