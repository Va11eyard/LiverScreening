/** API paths the browser may reach through /api/proxy (authenticated session required). */
export const PROXY_ALLOWED_PATHS = new Set([
  "cases",
  "surveys",
  "reports/weekly",
  "reports/stages",
  "reports/hospitals",
  "reports/excel",
  "reports/survey-excel",
  "reports/training-export",
  "reports/exports",
]);

const CASE_IMAGE_RE = /^cases\/[^/]+\/images$/;
const CASE_ARCHIVE_RE = /^cases\/[^/]+\/images\/archive$/;
const CASE_DETAIL_RE = /^cases\/[^/]+$/;
const CASE_IMAGE_DELETE_RE = /^cases\/[^/]+\/images\/[^/]+$/;
const CASE_IMAGE_FILE_RE = /^cases\/[^/]+\/images\/[^/]+\/file$/;
const REPORTS_EXPORTS_RE = /^reports\/exports$/;
const REPORTS_EXPORT_FILE_RE = /^reports\/exports\/[^/]+$/;

export function normalizeProxySegments(segments: string[]): string[] {
  if (segments[0] === "api" && segments[1] === "v1") {
    return segments.slice(2);
  }
  return segments;
}

export function isProxyPathAllowed(segments: string[]): boolean {
  const path = normalizeProxySegments(segments).join("/");
  if (PROXY_ALLOWED_PATHS.has(path)) {
    return true;
  }
  return CASE_IMAGE_RE.test(path) || CASE_ARCHIVE_RE.test(path) || CASE_DETAIL_RE.test(path) || CASE_IMAGE_DELETE_RE.test(path) || CASE_IMAGE_FILE_RE.test(path) || REPORTS_EXPORTS_RE.test(path) || REPORTS_EXPORT_FILE_RE.test(path);
}
