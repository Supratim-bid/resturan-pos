// Build CSS variables from a restaurant's brand colours (up to 4 tones).
function mix(hex: string, other: string, t: number) {
  const a = hex.match(/\w\w/g)!.map((h) => parseInt(h, 16)), b = other.match(/\w\w/g)!.map((h) => parseInt(h, 16));
  return "#" + a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, "0")).join("");
}
const ok = (c: string) => /^#[0-9a-f]{6}$/i.test(c);

/** CSS variables for the whole app and bills. tone3/tone4 are optional extra tones (blank = auto-derived). */
export function themeCss(primary = "#9a1c1f", accent = "#c8962e", tone3 = "", tone4 = "") {
  const p = ok(primary) ? primary : "#9a1c1f";
  const a = ok(accent) ? accent : "#c8962e";
  const t3 = ok(tone3) ? tone3 : mix(p, "#000000", 0.28);   // default: a darker shade of primary -> gives a gradient
  const t4 = ok(tone4) ? tone4 : mix(a, "#000000", 0.25);   // default: a darker shade of accent
  return `:root{--color-brand:${p};--color-brand-dark:${mix(p, "#000000", 0.22)};--color-brand-light:${mix(p, "#ffffff", 0.9)};` +
    `--color-gold:${a};--color-turmeric:${a};--color-gold-dark:${mix(a, "#000000", 0.22)};--color-gold-light:${mix(a, "#ffffff", 0.8)};` +
    `--color-brand-2:${t3};--color-accent-2:${t4};` +
    `--brand-gradient:linear-gradient(135deg, ${p} 0%, ${t3} 100%);}`;
}

/** The 4 tones in display order, with the auto-derived values filled in - for the settings preview. */
export function tonePalette(primary = "#9a1c1f", accent = "#c8962e", tone3 = "", tone4 = "") {
  const p = ok(primary) ? primary : "#9a1c1f";
  const a = ok(accent) ? accent : "#c8962e";
  return {
    primary: p,
    accent: a,
    tone3: ok(tone3) ? tone3 : mix(p, "#000000", 0.28),
    tone4: ok(tone4) ? tone4 : mix(a, "#000000", 0.25),
  };
}
