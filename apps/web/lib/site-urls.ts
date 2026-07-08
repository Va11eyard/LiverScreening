export function screeningAppUrl() {
  return process.env.NEXT_PUBLIC_SCREENING_URL ?? "http://localhost:3006";
}

export function mlLabUrl() {
  return process.env.NEXT_PUBLIC_ML_LAB_URL ?? "http://localhost:3005";
}
