// Build CSS variables from a restaurant's two brand colours
function mix(hex: string, other: string, t: number) {
  const a = hex.match(/\w\w/g)!.map((h) => parseInt(h, 16)), b = other.match(/\w\w/g)!.map((h) => parseInt(h, 16));
  return "#" + a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, "0")).join("");
}
export function themeCss(primary = "#9a1c1f", accent = "#c8962e") {
  const ok = (c: string) => /^#[0-9a-f]{6}$/i.test(c);
  const p = ok(primary) ? primary : "#9a1c1f", a = ok(accent) ? accent : "#c8962e";
  return `:root{--color-brand:${p};--color-brand-dark:${mix(p, "#000000", 0.22)};--color-brand-light:${mix(p, "#ffffff", 0.9)};` +
    `--color-gold:${a};--color-turmeric:${a};--color-gold-dark:${mix(a, "#000000", 0.22)};--color-gold-light:${mix(a, "#ffffff", 0.8)};}`;
}
