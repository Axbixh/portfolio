/*
 * Thin client for the backend. Every call is fire-and-forget tolerant:
 * the site must work as a static deploy with no API behind it.
 */

export async function publishShotCard(canvas, recipe) {
  try {
    const res = await fetch('/api/shot-cards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image: canvas.toDataURL('image/png'),
        recipe: { pattern: recipe.pattern, line: recipe.line },
      }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null; // no backend — static deploy, that's fine
  }
}
