/**
 * Maps a taxonomy topic's raw `domain` string (English, from the taxonomy data package) to a
 * bilingual message key under the "domains" namespace, for display on the dashboard's
 * PathProgress. Unknown domains (a future subject/path not yet covered by this map) fall back to
 * the raw string rather than crashing on a missing translation key.
 */
export const DOMAIN_LABEL_KEYS: Record<string, string> = {
  "Powers & Roots": "powersRoots",
  "Number Theory": "numberTheory",
  "Fractions": "fractions",
  "Measurement": "measurement",
  "Coordinate Geometry": "coordinateGeometry",
  "Geometry": "geometry"
};

export function domainLabel(domain: string, t: (key: string) => string): string {
  const key = DOMAIN_LABEL_KEYS[domain];
  return key ? t(key) : domain;
}
