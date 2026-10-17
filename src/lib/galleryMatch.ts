/**
 * Which of her photos she sends.
 *
 * Felicia has a camera roll, the way a person does: the permanent gallery that
 * ships with the app, plus every picture she has already sent this account.
 * When the conversation calls for a photo she scrolls that roll for one that
 * fits — cooking gets the kitchen, a late night gets the bedroom, going out
 * gets the red dress — and only takes a new picture when nothing in it does.
 *
 * The matching is an ordinary word score rather than another model call,
 * because it runs inside the same request as her reply: it has to be free and
 * instant. Both sides of the comparison go through the same normalisation, so
 * "kitchens", "kitchen" and "Kitchen." are the same word no matter which side
 * it came from.
 */

export type GalleryCandidate = {
  /** Unique key for the candidate, e.g. `gallery:red-dress-sofa`. */
  key: string;
  /** Direct image URL to send. */
  url: string;
  /** Caption shown under the photo in the conversation. */
  label: string;
  /** Descriptive sentence stored as the photo's scene. */
  scene: string;
  /** The permanent gallery entry this came from, when it is one of those. */
  galleryId?: string;
  /** Descriptor words for the picture. */
  tags: readonly string[];
  /** How many times this exact picture has already been sent. */
  sentCount?: number;
};

export type GalleryMatch = {
  candidate: GalleryCandidate;
  score: number;
};

/**
 * Words that only ever mean "send me a picture" or glue the sentence together.
 * Left in, they would match every photo equally and drown out the words that
 * actually say what the conversation is about.
 */
const IGNORED = new Set([
  // the request itself
  "photo", "photos", "pic", "pics", "picture", "pictures", "selfie", "selfies",
  "snap", "snaps", "polaroid", "send", "sends", "send me", "show", "share",
  "give", "post", "see", "look", "wanna", "want",
  // glue
  "about", "after", "again", "all", "also", "and", "another", "any", "are",
  "because", "been", "before", "being", "but", "can", "could", "did", "does",
  "doing", "don", "down", "ever", "every", "felicia", "for", "from", "get",
  "got", "had", "has", "have", "here", "hey", "his", "her", "hers", "him",
  "how", "into", "its", "just", "know", "let", "like", "love", "made", "make",
  "may", "maybe", "me", "might", "mine", "miss", "more", "most", "much", "must",
  "my", "need", "new", "now", "okay", "one", "only", "other", "our", "out",
  "over", "own", "please", "pls", "put", "really", "right", "said", "same",
  "say", "she", "should", "since", "some", "still", "such", "sure", "take",
  "than", "that", "the", "their", "them", "then", "there", "these", "they",
  "thing", "this", "those", "though", "through", "time",
  "today", "too", "under", "until", "up", "very", "was", "way", "well", "were",
  "what", "when", "where", "which", "while", "who", "why", "will", "with",
  "would", "yes", "yet", "you", "your", "yours", "yourself",
]);

/**
 * A crude stemmer, deliberately small.
 *
 * It only has to make the same idea look like the same string on both sides of
 * the comparison — "cooking" against "cook", "kitchens" against "kitchen" — so
 * a handful of suffix rules is enough, and it must never be cleverer than the
 * tags it is matching against.
 */
function stem(word: string): string {
  if (word.length > 5 && word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (word.length > 5 && word.endsWith("ing")) return word.slice(0, -3);
  if (word.length > 4 && word.endsWith("ed")) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith("es") && !word.endsWith("ses")) {
    return word.slice(0, -2);
  }
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) {
    return word.slice(0, -1);
  }
  return word;
}

/** Every meaningful word in a piece of text, stemmed and de-duplicated. */
export function matchingWords(text: string): Set<string> {
  const found = new Set<string>();
  // Apostrophes are dropped rather than kept, so "it's" and "its" and "don't"
  // all fall apart into the same short words the stop list already covers.
  for (const raw of text.toLowerCase().split(/[^a-z0-9]+/)) {
    if (raw.length < 3) continue;
    const word = stem(raw);
    if (IGNORED.has(raw) || IGNORED.has(word)) continue;
    found.add(word);
  }
  return found;
}

/**
 * How well one picture fits what is being talked about.
 *
 * One strong, distinct word ("kitchen", "dress", "beach") is worth more than a
 * vague agreement, so a match on any single tag outweighs noise from the rest
 * of the sentence. Pictures she has already sent carry a penalty, which is what
 * keeps her sending different ones instead of the same favourite every time.
 */
export function scoreCandidate(
  context: Set<string>,
  candidate: GalleryCandidate,
): number {
  const words = new Set<string>();
  for (const tag of candidate.tags) {
    for (const word of matchingWords(tag)) words.add(word);
  }
  for (const word of matchingWords(candidate.label)) words.add(word);
  if (words.size === 0) return 0;

  let hits = 0;
  for (const word of context) {
    if (words.has(word)) hits += 1;
  }

  const repeatPenalty = 2 * Math.max(0, candidate.sentCount ?? 0);
  return Math.max(0, hits - repeatPenalty);
}

/**
 * The best-fitting picture for what was just said, or null when nothing fits.
 *
 * Passing several pieces of text ("send me a pic of you cooking" plus her
 * reply) means any of them can bring the picture up, which is how a person
 * searches their own phone: the last few messages, not one sentence.
 */
export function bestPhoto(
  context: readonly string[],
  candidates: readonly GalleryCandidate[],
  minScore = 1,
): GalleryMatch | null {
  const words = new Set<string>();
  for (const text of context) {
    for (const word of matchingWords(text)) words.add(word);
  }
  if (words.size === 0) return null;

  let best: GalleryMatch | null = null;
  for (const candidate of candidates) {
    if (!candidate.url) continue;
    const score = scoreCandidate(words, candidate);
    if (score < minScore) continue;
    if (
      best === null ||
      score > best.score ||
      (score === best.score &&
        (candidate.sentCount ?? 0) < (best.candidate.sentCount ?? 0))
    ) {
      best = { candidate, score };
    }
  }

  return best;
}
