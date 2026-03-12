/**
 * Montage profile selection and prompt generation.
 *
 * Selects a director-style profile based on script topic keywords.
 * Generates per-profile prompt guidelines for the LLM planner.
 */
import {
  MONTAGE_PROFILE_CATALOG,
  type MontageProfileEntry,
} from '@reelstack/remotion/catalog';

/**
 * Select a montage profile based on script/topic content.
 *
 * If `explicitProfileId` is provided and valid, returns that profile.
 * Otherwise, scores each profile by counting topic keyword matches
 * in the script text and returns the highest-scoring profile.
 * Falls back to the first profile (network-chuck) if no keywords match.
 */
export function selectMontageProfile(
  scriptOrTopic: string,
  explicitProfileId?: string,
): MontageProfileEntry {
  // Explicit override
  if (explicitProfileId) {
    const found = MONTAGE_PROFILE_CATALOG.find(p => p.id === explicitProfileId);
    if (found) return found;
  }

  const text = scriptOrTopic.toLowerCase();

  let bestProfile = MONTAGE_PROFILE_CATALOG[0];
  let bestScore = 0;

  for (const profile of MONTAGE_PROFILE_CATALOG) {
    let score = 0;
    for (const keyword of profile.topicKeywords) {
      if (text.includes(keyword)) {
        score++;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestProfile = profile;
    }
  }

  return bestProfile;
}

/** Format transition whitelist as quoted comma-separated string. */
function formatTransitionList(profile: MontageProfileEntry): string {
  return profile.allowedTransitions.map(t => `"${t}"`).join(', ');
}

/** Format director rules as numbered list. */
function formatRuleLines(profile: MontageProfileEntry): string {
  return profile.directorRules.map((rule, i) => `  ${i + 1}. ${rule}`).join('\n');
}

/**
 * Build profile-specific prompt guidelines for the LLM director.
 * Injected into the planner system prompt when a montage profile is active.
 */
export function buildProfileGuidelines(profile: MontageProfileEntry): string {
  const transitionList = formatTransitionList(profile);

  const sfxLines = Object.entries(profile.sfxMapping)
    .map(([action, sfxId]) => `  - ${action}: "${sfxId}"`)
    .join('\n');

  const ruleLines = formatRuleLines(profile);

  const colorLines = Object.entries(profile.colorPalette)
    .map(([name, hex]) => `  - ${name}: ${hex}`)
    .join('\n');

  return `## MONTAGE PROFILE: ${profile.id} (${profile.name})

${profile.description}

### Pacing
- Max shot duration: ${profile.maxShotDurationSec}s (shots longer than this WITHOUT zoom/effect = ERROR)
- Target effects per 30s: ${profile.effectsPerThirtySec}
- Pacing level: ${profile.pacing}

### Allowed Transitions (ONLY use these)
${transitionList}
Any transition NOT in this list will be REJECTED by the supervisor.

### SFX Mapping (use these SFX for each action type)
${sfxLines}

### Director Rules (MUST follow)
${ruleLines}

### Color Palette
${colorLines}

### Tool Preference Order
${profile.toolPreference.map((t, i) => `  ${i + 1}. ${t}`).join('\n')}

### Reel Arc Template (suggested structure)
${REEL_ARC_TEMPLATES[profile.id] ?? 'No specific arc template.'}

### B-Roll CSS Filter
${profile.bRollFilter ? `Apply cssFilter: "${profile.bRollFilter}" to ALL bRollSegments for this profile's look.` : 'No default B-roll filter.'}

### Segment Type Tagging
Tag EVERY shot with one of: HOOK, DEMO, PROBLEM, SOLUTION, PROOF, TOOL_REVIEW, CTA.
Add "segmentType" field to each shot's "reason" field (e.g., "[HOOK] Strong opening with text emphasis").`;
}

/** Per-profile reel arc templates — suggested structure for the LLM director. */
const REEL_ARC_TEMPLATES: Record<string, string> = {
  'network-chuck': `0-2s: HOOK — zoom 1.4x + big glitch text on center + glitch SFX
2-7s: DEMO — screen recording (terminal/code), pan/zoom on typed text
7-12s: SPLIT/OVERLAY — face at bottom (PiP circle), content on top. Hard cut transitions.
12-20s: B-ROLL — fast cuts between different content (UI, files, code). Floating UI.
20s+: FAST CUTS + CTA — very fast cuts, climax, subscribe banner`,

  'leadgen-man': `0-1.5s: HOOK — stock B-roll (office/city) + big UPPERCASE text with yellow highlight + whoosh
1.5-5s: PROBLEM — face zoom + emoji bounce, abstract concepts illustrated with stocks
5-15s: SOLUTION — floating UI screenshots (3D tilt), tool icons bounce-in
15-25s: PROOF — counters, statistics, social proof. Fast stock+face cuts.
25s+: CTA — fullscreen face, subscribe/follow, final text emphasis`,

  'ai-tool-showcase': `0-2s: HOOK — "X tools you NEED" text + logo bounce + pop SFX
Per tool (3-5s each): TOOL REVIEW — logo bounce-in → screenshot 3D tilt → 1 feature highlight → next
Last 3s: CTA — "Follow for more" + subscribe banner`,
};

/**
 * Build profile-specific supervisor review checks.
 * Injected into the supervisor prompt to enforce per-profile rules.
 */
export function buildProfileSupervisorChecks(profile: MontageProfileEntry): string {
  const transitionList = formatTransitionList(profile);

  const sfxLines = Object.entries(profile.sfxMapping)
    .map(([action, sfxId]) => `  - ${action} must use "${sfxId}"`)
    .join('\n');

  const ruleChecks = formatRuleLines(profile);

  return `## PROFILE-SPECIFIC CHECKS: ${profile.id} (${profile.name})

### Shot Duration (REJECT if violated)
- Any shot longer than ${profile.maxShotDurationSec}s without zoom/effect = REJECT
- Pacing: ${profile.pacing}

### Transition Whitelist (REJECT if violated)
Allowed: ${transitionList}
Any transition NOT in this list = REJECT

### Effect Density (REJECT if too low)
- Minimum ${profile.effectsPerThirtySec} effects per 30s of reel
- Count ALL effects, counters, text-emphasis, emoji-popup, etc.

### SFX Consistency (check per action type)
${sfxLines}

### Director Rules (check ALL — REJECT if critical rules violated)
${ruleChecks}`;
}
