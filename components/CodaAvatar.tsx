import type { CSSProperties } from "react";

export type CodaMood = "default" | "thinking" | "excited" | "oops" | "idle";

export function CodaAvatar({ mood = "default", size = 48, className = "" }: { mood?: CodaMood; size?: number; className?: string }) {
  const eye = mood === "idle" ? "M35 43 Q39 47 43 43 M57 43 Q61 47 65 43"
    : mood === "thinking" ? "M35 42 Q39 40 43 42 M57 42 Q61 42 65 42"
    : mood === "oops" ? "M35 39 L43 47 M43 39 L35 47 M57 39 L65 47 M65 39 L57 47"
    : "M35 39 Q39 35 43 39 M57 39 Q61 35 65 39";
  const mouth = mood === "idle" ? "M43 59 Q50 63 57 59"
    : mood === "thinking" ? "M45 59 Q53 62 58 56"
    : mood === "oops" ? "M42 61 Q47 55 52 61 T62 61"
    : "M39 55 Q50 70 61 55";
  const faceStyle: CSSProperties = { width: size, height: size, display: "inline-block", flex: "0 0 auto" };
  return (
    <svg className={className} style={faceStyle} viewBox="0 0 100 112" role="img" aria-label={`Coda ${mood} expression`} xmlns="http://www.w3.org/2000/svg">
      {mood === "idle" && <text x="74" y="19" fill="#b8aaff" fontSize="12" fontFamily="monospace">Zz</text>}
      {mood === "thinking" && <g fill="#b8aaff"><circle cx="78" cy="20" r="3"/><circle cx="85" cy="12" r="5"/></g>}
      {mood === "excited" && <g fill="#ffd978"><path d="M17 18l3 7 7 3-7 3-3 7-3-7-7-3 7-3z"/><path d="M83 42l2 5 5 2-5 2-2 5-2-5-5-2 5-2z"/></g>}
      <path d="M24 29 Q10 8 6 26 Q8 39 27 42 M76 29 Q90 8 94 26 Q92 39 73 42" fill="#9b8cff" stroke="#5c4dc9" strokeWidth="3"/>
      <path d="M18 90 Q18 72 36 69 L64 69 Q82 72 82 90 L82 108 L18 108Z" fill="#7666ed"/>
      <path d="M38 71 L50 85 L62 71" fill="none" stroke="#c9c0ff" strokeWidth="4" strokeLinecap="round"/>
      <path d="M24 28 Q24 14 50 14 Q76 14 76 28 L76 52 Q76 75 50 77 Q24 75 24 52Z" fill="#b5a8ff" stroke="#6958d9" strokeWidth="3"/>
      <path d={eye} fill="none" stroke="#29234e" strokeWidth="4" strokeLinecap="round"/>
      {mood === "excited" && <g fill="none" stroke="#29234e" strokeWidth="2.5"><path d="M35 37l4 6 4-6-4-6z"/><path d="M57 37l4 6 4-6-4-6z"/></g>}
      {mood !== "oops" && mood !== "idle" && <g fill="#fff"><circle cx="39" cy="37" r="2.3"/><circle cx="61" cy="37" r="2.3"/></g>}
      <path d={mouth} fill="none" stroke="#29234e" strokeWidth="4" strokeLinecap="round"/>
      {mood === "oops" && <path d="M76 29 Q89 17 86 37 Q83 45 76 41Z" fill="#8de4ff" stroke="#fff" strokeWidth="1.5"/>}
      {mood === "thinking" && <path d="M68 61 Q78 56 79 49" fill="none" stroke="#5c4dc9" strokeWidth="2.5" strokeLinecap="round"/>}
    </svg>
  );
}
