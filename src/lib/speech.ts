/**
 * Where one of her lines is cut so she can start speaking sooner.
 *
 * Rendering the whole reply before a syllable plays is what made her slow: a
 * text-to-speech call costs roughly in proportion to the text, so a two-line
 * answer was seconds of silence. The line is therefore cut into pieces — a
 * short opening phrase, then sentence-sized pieces — and the voice layer plays
 * the first while the rest is still being rendered.
 *
 * The same cut has to be made on the server, which is what caches and renders
 * each piece, so this lives here rather than inside either side.
 */
export function splitForSpeech(text: string): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];

  const pieces: string[] = [];

  // The opening piece is deliberately short: the wait people notice is the wait
  // for the first sound. A whole first sentence is used when it is short
  // enough to speak in a breath, otherwise the line is cut after roughly seven
  // words — a phrase renders in a fraction of the time of a reply, and the rest
  // is already being rendered while she says it.
  const firstSentence = clean.match(/^[^.!?…]+[.!?…]+/)?.[0].trim() ?? "";
  const opening = cut(
    clean,
    firstSentence && firstSentence.length <= 50 ? firstSentence.length : 40,
  );
  pieces.push(opening.head);
  let rest = opening.tail;

  // Everything after that is grouped into pieces that grow as the line goes
  // on. The reason for growing rather than fixed is that each piece has to be
  // rendered while the previous one is still playing: a short opening buys only
  // a moment, so the piece after it is short too, and by the time the pieces
  // are a sentence long there is a whole sentence of playback to render them
  // in. Fixed long pieces left her silent in the gap after a two-word opener.
  const sizes = [60, 90, 140, 200];
  let step = 0;
  while (rest) {
    const next = cut(rest, sizes[Math.min(step, sizes.length - 1)]);
    pieces.push(next.head);
    rest = next.tail;
    step += 1;
  }

  return pieces.filter((piece) => piece.length > 0);
}

/**
 * Cut at a word boundary near `limit`.
 *
 * A cut in the middle of a word is audible, so it walks back to the last space;
 * a single very long word is cut where the limit falls rather than left to
 * become one enormous piece.
 */
function cut(text: string, limit: number): { head: string; tail: string } {
  if (text.length <= limit) return { head: text, tail: "" };

  const space = text.lastIndexOf(" ", limit);
  const at = space > limit * 0.4 ? space : limit;
  return {
    head: text.slice(0, at).trim(),
    tail: text.slice(at).trim(),
  };
}
