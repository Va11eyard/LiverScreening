export function calcFib4(
  age?: string,
  ast?: string,
  alt?: number,
  platelets?: number,
): string {
  const a = parseFloat(String(age ?? "").replace(",", "."));
  const astN = parseFloat(String(ast ?? "").replace(",", "."));
  if (!a || !astN || !alt || !platelets || platelets <= 0 || alt <= 0) {
    return "—";
  }
  const fib4 = (a * astN) / (platelets * Math.sqrt(alt));
  return fib4.toFixed(2);
}
