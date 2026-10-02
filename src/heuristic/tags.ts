// Reads role and act information from AO3 "Additional Tags" (e.g. "Bottom Harry Potter", "Switching", "Rimming").

import type { Cast, Character } from "./characters";

export interface TagRole {
  char: Character;
  role: "top" | "bottom" | "switch";
  tag: string;
}

export interface TagInfo {
  roles: TagRole[];
  switching: string[];
  /** Tags saying an act happens, by category. */
  anal: string[];
  oral: string[];
  rimming: string[];
  blowjobs: string[];
}

const ROLE_PATTERNS: { re: RegExp; role: TagRole["role"] }[] = [
  // "Bottom Harry Potter", "Bottom!Harry", "Power Bottom Harry", "Bottom Harry (mostly)"
  { re: /^(?:power |service |pillow )?(bottom|top|switch|vers(?:atile)?)\s*!?\s*(.+)$/i, role: "top" },
  // "Harry Potter Bottoms", "Harry is a bottom", "Harry Tops", "Harry Is A Switch"
  { re: /^(.+?)\s+(?:is (?:a |an )?(?:total |power )?)?(bottoms?|tops?|switch(?:es)?|vers(?:atile)?)$/i, role: "top" },
];

function normalizeRole(word: string): TagRole["role"] {
  const w = word.toLowerCase();
  if (w.startsWith("bottom")) return "bottom";
  if (w.startsWith("top")) return "top";
  return "switch";
}

export function readTags(freeforms: string[], cast: Cast): TagInfo {
  const info: TagInfo = { roles: [], switching: [], anal: [], oral: [], rimming: [], blowjobs: [] };
  const findChar = (name: string): Character | undefined => {
    const n = name.replace(/\([^)]*\)/g, "").replace(/[!]/g, " ").trim();
    if (!n) return undefined;
    const lower = n.toLowerCase();
    return (
      cast.chars.find((c) => c.name.toLowerCase() === lower) ??
      cast.chars.find((c) => c.aliases.some((a) => a.toLowerCase() === lower)) ??
      cast.chars.find((c) => n.split(/\s+/).some((p) => c.aliases.includes(p)))
    );
  };

  for (const raw of freeforms) {
    const tag = raw.trim();
    const t = tag.toLowerCase();

    if (/^(?:switching|switch(?:ing)? roles?|versatile|vers|top\/bottom switch|bottoming from the top|topping from the bottom)$/.test(t)) {
      if (t === "switching" || t.startsWith("switch") || t.startsWith("vers")) info.switching.push(tag);
      continue;
    }
    // "Top Castiel/Bottom Dean Winchester" is two role tags in one.
    const parts = /^(?:power |service |pillow )?(?:bottom|top|switch|vers)\b.*\/\s*(?:power |service |pillow )?(?:bottom|top|switch|vers)\b/i.test(tag)
      ? tag.split("/").map((x) => x.trim())
      : [tag];
    for (const part of parts) {
      for (const { re } of ROLE_PATTERNS) {
        const m = part.match(re);
        if (!m) continue;
        const [roleWord, name] = re === ROLE_PATTERNS[0].re ? [m[1], m[2]] : [m[2], m[1]];
        const char = findChar(name);
        if (char) {
          info.roles.push({ char, role: normalizeRole(roleWord), tag });
          break;
        }
      }
    }

    if (/\brim(?:ming|med|s)?\b|ass eating|eating ass/.test(t)) info.rimming.push(tag);
    if (/blow ?jobs?|fellatio|deep ?throat|face[- ]fuck|cock ?sucking|oral fixation/.test(t)) info.blowjobs.push(tag);
    if (/\boral\b|blow ?jobs?|rim(?:ming)?\b|cunnilingus|deep ?throat|face[- ]fuck/.test(t)) info.oral.push(tag);
    if (/\banal\b|first time bottoming|bottoming|riding|anal sex|barebacking|knotting|pegging|prostate/.test(t)) info.anal.push(tag);
  }
  return info;
}
