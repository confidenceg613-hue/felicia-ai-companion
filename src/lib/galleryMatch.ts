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

/** How well one photo fits, and how it got there. */
type PhotoScore = {
  total: number;
  /** Matches in the photo's own caption — the surest sign of the right one. */
  titleHits: number;
};

/**
 * Words that only ever mean "send me a picture" or glue the sentence together.
 * Left in, they would match every photo equally and drown out the words that
 * actually say what the conversation is about.
 *
 * "selfie" is deliberately not in here: it names a kind of photo rather than
 * asking for one in the abstract, and it is aliased onto the photos of her that
 * are portraits, so a bare "send me a selfie" can still be answered.
 */
const IGNORED = new Set([
  // the request itself
  "photo", "photos", "pic", "pics", "picture", "pictures",
  "snap", "snaps", "polaroid", "send", "sends", "send me", "show", "share",
  "give", "post", "see", "look", "wanna", "want",
  // what she is doing with the clothes, rather than the clothes
  "wear", "wears", "wearing", "wore", "worn",
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
  // Generic words that turn up inside a real photo caption by accident. Each
  // one of these once decided a match on its own: "…shadows across the dunes"
  // picked the photo tagged "after a long day", because "long" was the only
  // word the two had in common.
  "bit", "come", "comes", "coming", "even", "getting", "hold", "kind", "life",
  "little", "long", "minute", "moment", "near", "never", "second", "sort",
  "whole",
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
  if (word.length > 5 && word.endsWith("ing")) return undouble(word.slice(0, -3));
  if (word.length > 4 && word.endsWith("ed")) return undouble(word.slice(0, -2));
  if (word.length > 3 && word.endsWith("es") && !word.endsWith("ses")) {
    return word.slice(0, -2);
  }
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) {
    return word.slice(0, -1);
  }
  return word;
}

/**
 * "swimming" → "swimm" → "swim", "running" → "run".
 *
 * Without this the two sides disagree exactly where it matters: the photo is
 * tagged "swimming" and the request says "swim", which look like different
 * words even though they are the same one.
 */
function undouble(word: string): string {
  const last = word.slice(-1);
  return word.length > 3 && word.slice(-2) === last + last
    ? word.slice(0, -1)
    : word;
}

/**
 * Words people use for something, mapped onto the words her photos are tagged
 * with.
 *
 * Matching is literal on purpose — it has to be free and instant, inside the
 * same request as her reply — so the small gaps between how someone asks and
 * how a photo is described are closed here rather than by a model.
 */
const ALIASES: Record<string, readonly string[]> = {
  bikini: ["swimsuit", "swimwear", "pool"],
  bathing: ["swimsuit", "pool"],
  beach: ["pool", "swimsuit", "summer"],
  clothes: ["outfit"],
  clothing: ["outfit"],
  gown: ["dress"],
  frock: ["dress"],
  selfie: ["portrait"],
  mirror: ["getting"],
  treadmill: ["gym"],
  workout: ["workout", "gym"],
  fitness: ["gym", "yoga"],
  exercises: ["exercise"],
  cooking: ["kitchen"],
  cooker: ["kitchen"],
  food: ["kitchen"],
  bedroom: ["bedroom", "bed"],
  showering: ["shower"],
  bathroom: ["bathroom", "shower"],
  stairway: ["staircase", "stairs"],
};

/** A word plus everything it is another way of saying. */
function expand(word: string): readonly string[] {
  const alias = ALIASES[word];
  return alias ? [word, ...alias] : [word];
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
    for (const expanded of expand(word)) found.add(expanded);
  }
  return found;
}

/**
 * How well one picture fits what is being talked about.
 *
 * Only the two things that are actually a description of the frame count — the
 * caption, at three points a word, and the tags, at two — and a word is only
 * ever counted once per photo.
 *
 * The prose description under each photo is deliberately left out of this.
 * It is written in her voice, so it shares ordinary words with any sentence at
 * all: asking about "shadows across the dunes" once matched the photo whose
 * description says "light across the bed", on the strength of "across" alone.
 * A picture she cannot pick out from her own roll is correctly served by taking
 * a new one instead.
 *
 * Pictures she has already sent carry a penalty, which is what keeps her
 * sending different ones instead of the same favourite every time.
 */
function scorePhoto(
  context: Set<string>,
  candidate: GalleryCandidate,
): PhotoScore {
  const caption = matchingWords(candidate.label);
  const tags = new Set<string>();
  for (const tag of candidate.tags) {
    for (const word of matchingWords(tag)) tags.add(word);
  }

  let total = 0;
  let titleHits = 0;
  for (const word of context) {
    if (caption.has(word)) {
      total += 3;
      titleHits += 1;
    } else if (tags.has(word)) {
      total += 2;
    }
  }

  if (total === 0) return { total: 0, titleHits: 0 };

  const repeatPenalty = 2 * Math.max(0, candidate.sentCount ?? 0);
  return { total: Math.max(0, total - repeatPenalty), titleHits };
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
  let bestTitleHits = 0;
  for (const candidate of candidates) {
    if (!candidate.url) continue;
    const score = scorePhoto(words, candidate);
    if (score.total < minScore) continue;
    if (
      best === null ||
      score.total > best.score ||
      // Two photos of the same scene tie on score; the one whose own caption
      // names what was asked for is the better answer.
      (score.total === best.score && score.titleHits > bestTitleHits) ||
      (score.total === best.score &&
        score.titleHits === bestTitleHits &&
        (candidate.sentCount ?? 0) < (best.candidate.sentCount ?? 0))
    ) {
      best = { candidate, score: score.total };
      bestTitleHits = score.titleHits;
    }
  }

  return best;
}
