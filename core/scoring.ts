export function scoreCandidate(
  wanted: string[],
  existing: string[],
  candidate: string[],
  offset: number,
  teamOffset: number,
) {
  const missing = [...new Set(wanted)].filter((s) => !existing.includes(s)),
    adds = missing.filter((s) => candidate.includes(s));
  const delta = Math.abs(offset - teamOffset) % 1440,
    gap = Math.min(delta, 1440 - delta);
  const skillScore = Math.round(
      70 * (missing.length ? adds.length / missing.length : 0),
    ),
    timeScore = Math.round(30 * (1 - gap / 720));
  return {
    score: skillScore + timeScore,
    skillScore,
    timeScore,
    adds,
    gapHours: Math.round(gap / 6) / 10,
    explanation: `${adds.length}/${missing.length} missing skills · ${Math.round(gap / 6) / 10}h timezone difference`,
  };
}
