// Reads role and act information from AO3 "Additional Tags" (e.g. "Bottom Harry Potter", "Switching", "Rimming").

import type { Cast, Character } from "./characters";

export interface TagRole {
  char: Character;
  role: "top" | "bottom" | "switch";
  tag: string;
  /** "Power Bottom" bosses the bed, "Service Top" aims to please, "Pillow Prince" lies back and receives. */
  style?: "power" | "service" | "pillow";
}

/** "Dominant Dean", "Submissive Cas", "Dom!Dean": a dynamic, which leans top or bottom but isn't the same thing. */
export interface TagDynamic {
  char: Character;
  lean: "top" | "bottom";
  tag: string;
}

export interface TagInfo {
  roles: TagRole[];
  dynamics: TagDynamic[];
  /** Tags about the pair's power dynamic or praise without saying who ("Dom/sub", "Praise Kink", "Daddy Kink"). */
  dynamicTags: string[];
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
  const info: TagInfo = { roles: [], dynamics: [], dynamicTags: [], switching: [], anal: [], oral: [], rimming: [], blowjobs: [] };
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
          const style = /^(power|service|pillow)\b/i.exec(part)?.[1]?.toLowerCase() as TagRole["style"] | undefined;
          info.roles.push({ char, role: normalizeRole(roleWord), tag, style });
          break;
        }
      }
    }

    // "Pillow Prince Dean", "Size Queen Cas": the one who lies back and receives.
    {
      const pm = tag.match(/^(?:pillow (?:prince|princess|queen)|size queen)\s*!?\s*(.+)$/i);
      const pc = pm && findChar(pm[1]);
      if (pc) info.roles.push({ char: pc, role: "bottom", tag, style: "pillow" });
    }
    // "Dominant Dean", "Dom!Cas", "Cas Is A Sub", "Submissive Dean Winchester"
    for (const part of tag.split("/").map((x) => x.trim())) {
      const dm = part.match(/^(dominant|domme?|dommy|submissive|sub|subby)\s*!?\s+(.+)$/i) ?? part.match(/^(dominant|domme?|dommy|submissive|sub|subby)!(.+)$/i);
      const dm2 = dm ? undefined : part.match(/^(.+?)\s+(?:is (?:a |an )?)?(dominant|domme?|dommy|submissive|sub|subby)$/i);
      const [word, name] = dm ? [dm[1], dm[2]] : dm2 ? [dm2[2], dm2[1]] : ["", ""];
      const dc = word && findChar(name);
      if (dc) info.dynamics.push({ char: dc, lean: /^(?:dom)/i.test(word) ? "top" : "bottom", tag });
    }
    // Omegaverse: "Alpha Dean", "Omega!Cas", "Cas Is An Omega". Alphas lean toward leading, omegas toward following.
    {
      const am = tag.match(/^(alpha|omega)\s*!?\s+(.+)$/i) ?? tag.match(/^(.+?)\s+(?:is (?:an? )?)(alpha|omega)$/i);
      const [word, name] = am ? (/^(?:alpha|omega)$/i.test(am[1]) ? [am[1], am[2]] : [am[2], am[1]]) : ["", ""];
      const ac = word && findChar(name);
      if (ac) info.dynamics.push({ char: ac, lean: /^alpha/i.test(word) ? "top" : "bottom", tag });
    }
    if (/dom\/sub|dominant\/submissive|\bd\/s\b|praise kink|good boy|good girl|daddy kink|degradation|power (?:dynamics?|imbalance|play)|bdsm|pet names?|primal play|sir kink|master\/slave|service top|submissive|dominant|\bdom\b|\bsub\b/.test(t) && !info.dynamics.some((d) => d.tag === tag)) info.dynamicTags.push(tag);

    if (/\brim(?:ming|med|s)?\b|ass eating|eating ass/.test(t)) info.rimming.push(tag);
    if (/blow ?jobs?|fellatio|deep ?throat|face[- ]fuck|cock ?sucking|oral fixation/.test(t)) info.blowjobs.push(tag);
    if (/\boral\b|blow ?jobs?|rim(?:ming)?\b|cunnilingus|deep ?throat|face[- ]fuck/.test(t)) info.oral.push(tag);
    if (/\banal\b|first time bottoming|bottoming|riding|anal sex|barebacking|knotting|pegging|prostate/.test(t)) info.anal.push(tag);
  }
  return info;
}
