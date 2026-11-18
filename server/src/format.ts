/** ["needs", 1, "revealWhen"] → "needs[1].revealWhen" */
export function formatPath(segments: readonly PropertyKey[]): string {
  return segments.reduce<string>((acc, key) => {
    if (typeof key === 'number') return `${acc}[${key}]`;
    return acc ? `${acc}.${String(key)}` : String(key);
  }, '');
}
