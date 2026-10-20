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
 *
 * A score alone is not enough when the request names something concrete — a
 * place, an outfit, a colour, a pose. A single shared word then answers it, and
 * "in a red dress" comes back as any dress at all. `requestDemands` reads those
 * specifics out of the message and `photoFits` removes every photo from the
 * roll that does not genuinely show all of them, so the choice left is either
 * an accurate one or nothing — and nothing means she takes a new photo.
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
  // "beach" deliberately has no alias onto "pool": a swimming pool is not the
  // beach, and pairing the two is what answered a beach request with a pool
  // photo. A beach with no photo in the roll takes a new one instead.
  clothes: ["outfit"],
  clothing: ["outfit"],
  gown: ["dress"],
  frock: ["dress"],
  selfie: ["portrait"],
  mirror: ["getting"],
  treadmill: ["gym"],
  workout: ["workout", "gym"],
  // "fitness" reaches the gym photos, not the yoga ones: a photo tagged
  // fitness is not a yoga photo, and pairing them answered "do a yoga pose"
  // with a weights bench.
  fitness: ["gym"],
  // A request for a pose is satisfied by a photo that really holds one —
  // stretching or arms raised count, because that is what a pose looks like
  // in her roll.
  pose: ["stretching", "arms"],
  exercises: ["exercise"],
  cooking: ["kitchen"],
  cooker: ["kitchen"],
  food: ["kitchen"],
  bedroom: ["bedroom", "bed"],
  showering: ["shower"],
  bathroom: ["bathroom", "shower"],
  stairway: ["staircase", "stairs"],
};

/** A word plus everything it is another way of saying.
 *
 * The index is keyed by the *stem* of each entry, because that is what the
 * caller holds: "cooking" arrives here as "cook", so a key written "cooking"
 * would never have been found — half the table was dead.
 *
 * The values are stemmed for the same reason. Both sides of a match are
 * stemmed, so an alias written "stretching" could only ever be met by the exact
 * string "stretching" and never by the stem "stretch" the other side actually
 * holds — the alias looked wired up and answered nothing.
 */
const ALIAS_INDEX = new Map<string, readonly string[]>();
for (const [key, value] of Object.entries(ALIASES)) {
  const stemKey = stem(key);
  if (!ALIAS_INDEX.has(stemKey)) {
    ALIAS_INDEX.set(
      stemKey,
      value.map((alias) => stem(alias)),
    );
  }
}

function expand(word: string): readonly string[] {
  const alias = ALIAS_INDEX.get(word);
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

// ---------------------------------------------------------------------------
// What a request demands of a photo
// ---------------------------------------------------------------------------

/**
 * The kinds of thing a request can name that a photo has to actually show.
 *
 * These are read out of the user's own message — never her reply, never the
 * model's scene line — so a demand always traces back to something they asked
 * for. A request with none of these words is left to the ordinary score above.
 */
export type DemandKind = "clothing" | "colour" | "place" | "action" | "framing";

/**
 * One thing the picture has to show.
 *
 * `required` holds one set per idea, and every set must be hit; the words
 * inside a single set are alternatives for the same idea ("pose", "posing" and
 * "posed" are one idea, "gown" and "dress" are one idea), so a photo with any
 * one of them satisfies it.
 */
export type Demand = {
  kind: DemandKind;
  required: Array<Set<string>>;
};

/** A concept and every way of writing it that a request might use. */
type Concept = { kind: DemandKind; forms: string[] };

/**
 * What a photo can be asked for, by kind.
 *
 * Forms are written the way people write them, then run through the same
 * stemming as everything else — "lying" and "pose" take their irregular
 * spellings as extra forms because the stemmer would otherwise split them
 * apart from "lie" and "posing".
 *
 * Time of day is deliberately absent: "good night, send me a pic" would turn
 * the greeting into a demand no photo could meet.
 */
const CONCEPTS: Concept[] = [
  // What she is wearing.
  { kind: "clothing", forms: ["dress", "dresses"] },
  { kind: "clothing", forms: ["gown"] },
  { kind: "clothing", forms: ["frock"] },
  { kind: "clothing", forms: ["skirt", "skirts"] },
  { kind: "clothing", forms: ["shorts"] },
  { kind: "clothing", forms: ["jeans"] },
  { kind: "clothing", forms: ["trousers"] },
  { kind: "clothing", forms: ["pants"] },
  { kind: "clothing", forms: ["shirt", "shirts"] },
  { kind: "clothing", forms: ["blouse"] },
  { kind: "clothing", forms: ["top", "tops"] },
  { kind: "clothing", forms: ["tank"] },
  { kind: "clothing", forms: ["vest"] },
  { kind: "clothing", forms: ["camisole"] },
  { kind: "clothing", forms: ["bodysuit", "bodysuits"] },
  { kind: "clothing", forms: ["swimsuit", "swimsuits"] },
  { kind: "clothing", forms: ["bikini", "bikinis"] },
  { kind: "clothing", forms: ["swimwear"] },
  { kind: "clothing", forms: ["towel", "towels"] },
  { kind: "clothing", forms: ["robe", "robes"] },
  { kind: "clothing", forms: ["sweater", "sweaters"] },
  { kind: "clothing", forms: ["knit"] },
  { kind: "clothing", forms: ["hoodie"] },
  { kind: "clothing", forms: ["jacket"] },
  { kind: "clothing", forms: ["coat"] },
  { kind: "clothing", forms: ["blazer"] },
  { kind: "clothing", forms: ["suit", "suits"] },
  { kind: "clothing", forms: ["lingerie"] },
  { kind: "clothing", forms: ["bra", "bras"] },
  { kind: "clothing", forms: ["linen"] },
  { kind: "clothing", forms: ["denim"] },
  { kind: "clothing", forms: ["satin"] },
  { kind: "clothing", forms: ["lace"] },
  { kind: "clothing", forms: ["leggings", "legging"] },
  { kind: "clothing", forms: ["tracksuit"] },
  { kind: "clothing", forms: ["outfit", "outfits"] },
  { kind: "clothing", forms: ["apron"] },
  { kind: "clothing", forms: ["heels", "heel"] },
  { kind: "clothing", forms: ["boots", "boot"] },
  { kind: "clothing", forms: ["sneakers", "sneaker"] },
  { kind: "clothing", forms: ["trainers", "trainer"] },
  { kind: "clothing", forms: ["sandals", "sandal"] },
  { kind: "clothing", forms: ["flats", "flat"] },
  { kind: "clothing", forms: ["hat", "hats"] },
  { kind: "clothing", forms: ["cap"] },
  { kind: "clothing", forms: ["sunglasses"] },
  { kind: "clothing", forms: ["necklace"] },

  // Colours — of the clothes, the light, or anything else in the frame.
  { kind: "colour", forms: ["red"] },
  { kind: "colour", forms: ["blue"] },
  { kind: "colour", forms: ["green"] },
  { kind: "colour", forms: ["black"] },
  { kind: "colour", forms: ["white"] },
  { kind: "colour", forms: ["pink"] },
  { kind: "colour", forms: ["yellow"] },
  { kind: "colour", forms: ["purple"] },
  { kind: "colour", forms: ["violet"] },
  { kind: "colour", forms: ["lilac"] },
  { kind: "colour", forms: ["lavender"] },
  { kind: "colour", forms: ["grey", "gray"] },
  { kind: "colour", forms: ["brown"] },
  { kind: "colour", forms: ["orange"] },
  { kind: "colour", forms: ["beige"] },
  { kind: "colour", forms: ["navy"] },
  { kind: "colour", forms: ["gold"] },
  { kind: "colour", forms: ["silver"] },
  { kind: "colour", forms: ["floral"] },
  { kind: "colour", forms: ["striped"] },

  // Where the picture is.
  { kind: "place", forms: ["home"] },
  { kind: "place", forms: ["house"] },
  { kind: "place", forms: ["apartment"] },
  { kind: "place", forms: ["bedroom"] },
  { kind: "place", forms: ["bed"] },
  { kind: "place", forms: ["kitchen"] },
  { kind: "place", forms: ["bathroom"] },
  { kind: "place", forms: ["shower"] },
  { kind: "place", forms: ["couch"] },
  { kind: "place", forms: ["sofa"] },
  { kind: "place", forms: ["floor"] },
  { kind: "place", forms: ["stairs"] },
  { kind: "place", forms: ["staircase"] },
  { kind: "place", forms: ["wall"] },
  { kind: "place", forms: ["counter"] },
  { kind: "place", forms: ["garden"] },
  { kind: "place", forms: ["balcony"] },
  { kind: "place", forms: ["terrace"] },
  { kind: "place", forms: ["rooftop"] },
  { kind: "place", forms: ["roof"] },
  { kind: "place", forms: ["porch"] },
  { kind: "place", forms: ["pool"] },
  { kind: "place", forms: ["poolside"] },
  { kind: "place", forms: ["beach"] },
  { kind: "place", forms: ["sea"] },
  { kind: "place", forms: ["ocean"] },
  { kind: "place", forms: ["sand"] },
  { kind: "place", forms: ["park"] },
  { kind: "place", forms: ["street"] },
  { kind: "place", forms: ["road"] },
  { kind: "place", forms: ["city"] },
  { kind: "place", forms: ["market"] },
  { kind: "place", forms: ["shop"] },
  { kind: "place", forms: ["mall"] },
  { kind: "place", forms: ["office"] },
  { kind: "place", forms: ["school"] },
  { kind: "place", forms: ["library"] },
  { kind: "place", forms: ["church"] },
  { kind: "place", forms: ["mosque"] },
  { kind: "place", forms: ["gym"] },
  { kind: "place", forms: ["studio"] },
  { kind: "place", forms: ["stage"] },
  { kind: "place", forms: ["club"] },
  { kind: "place", forms: ["bar"] },
  { kind: "place", forms: ["pub"] },
  { kind: "place", forms: ["restaurant"] },
  { kind: "place", forms: ["cafe"] },
  { kind: "place", forms: ["hotel"] },
  { kind: "place", forms: ["lobby"] },
  { kind: "place", forms: ["airport"] },
  { kind: "place", forms: ["plane"] },
  { kind: "place", forms: ["train"] },
  { kind: "place", forms: ["bus"] },
  { kind: "place", forms: ["car"] },
  { kind: "place", forms: ["boat"] },
  { kind: "place", forms: ["yacht"] },
  { kind: "place", forms: ["cinema"] },
  { kind: "place", forms: ["theatre"] },
  { kind: "place", forms: ["museum"] },
  { kind: "place", forms: ["forest"] },
  { kind: "place", forms: ["mountain"] },
  { kind: "place", forms: ["river"] },
  { kind: "place", forms: ["field"] },
  { kind: "place", forms: ["outdoors"] },
  { kind: "place", forms: ["outside"] },
  { kind: "place", forms: ["indoors"] },
  { kind: "place", forms: ["dinner"] },
  { kind: "place", forms: ["party"] },

  // What she is doing — the pose half of the request.
  { kind: "action", forms: ["sit", "sitting"] },
  { kind: "action", forms: ["stand", "standing"] },
  { kind: "action", forms: ["lie", "lying"] },
  { kind: "action", forms: ["pose", "posing", "posed", "poses"] },
  { kind: "action", forms: ["dance", "dancing"] },
  { kind: "action", forms: ["swim", "swimming"] },
  { kind: "action", forms: ["workout", "workouts"] },
  { kind: "action", forms: ["exercise", "exercises"] },
  { kind: "action", forms: ["yoga"] },
  { kind: "action", forms: ["stretch", "stretching"] },
  { kind: "action", forms: ["cook", "cooking"] },
  { kind: "action", forms: ["bake", "baking"] },
  { kind: "action", forms: ["eat", "eating"] },
  { kind: "action", forms: ["drink", "drinking"] },
  { kind: "action", forms: ["laugh", "laughing"] },
  { kind: "action", forms: ["smile", "smiling"] },
  { kind: "action", forms: ["walk", "walking"] },
  { kind: "action", forms: ["run", "running"] },
  { kind: "action", forms: ["jog", "jogging"] },
  { kind: "action", forms: ["jump", "jumping"] },
  { kind: "action", forms: ["sing", "singing"] },
  { kind: "action", forms: ["read", "reading"] },
  { kind: "action", forms: ["sleep", "sleeping"] },
  { kind: "action", forms: ["scroll", "scrolling"] },
  { kind: "action", forms: ["relax", "relaxing"] },
  { kind: "action", forms: ["lean", "leaning"] },
  { kind: "action", forms: ["crouch", "crouching"] },
  { kind: "action", forms: ["kneel", "kneeling"] },
  { kind: "action", forms: ["bend", "bending"] },
  { kind: "action", forms: ["twirl", "twirling"] },
  { kind: "action", forms: ["lounge"] },
  { kind: "action", forms: ["sunbathe", "sunbathing"] },

  // How the frame is shot.
  { kind: "framing", forms: ["selfie", "selfies"] },
  { kind: "framing", forms: ["portrait", "portraits"] },
  { kind: "framing", forms: ["headshot"] },
];

/** Concepts that are more than one word — each token becomes its own set. */
const PHRASE_CONCEPTS: Concept[] = [
  { kind: "clothing", forms: ["dressed up"] },
  { kind: "place", forms: ["living room"] },
  { kind: "place", forms: ["going out"] },
  { kind: "place", forms: ["night out"] },
  { kind: "action", forms: ["getting ready"] },
  { kind: "action", forms: ["working out"] },
  { kind: "action", forms: ["arms up"] },
  { kind: "action", forms: ["hair up"] },
  { kind: "action", forms: ["hands on hips"] },
];

/** Every meaningful word, in the same shape the scorer uses. */
function tokensOf(text: string): string[] {
  const found: string[] = [];
  for (const raw of text.toLowerCase().split(/[^a-z0-9]+/)) {
    if (raw.length < 3) continue;
    const word = stem(raw);
    if (IGNORED.has(raw) || IGNORED.has(word)) continue;
    found.push(word);
  }
  return found;
}

function familyOf(kind: DemandKind, forms: string[]): { kind: DemandKind; words: Set<string> } {
  const words = new Set<string>();
  for (const form of forms) {
    for (const word of matchingWords(form)) words.add(word);
  }
  return { kind, words };
}

/** stem → the concept that word belongs to (first one wins). */
const FAMILY_BY_STEM = new Map<string, { kind: DemandKind; words: Set<string> }>();
for (const concept of CONCEPTS) {
  const family = familyOf(concept.kind, concept.forms);
  for (const form of concept.forms) {
    const token = stem(form);
    if (!FAMILY_BY_STEM.has(token)) FAMILY_BY_STEM.set(token, family);
  }
}

/**
 * The concrete things a request asks the photo to show — a place, an outfit, a
 * colour, a pose, a framing.
 *
 * Read from the request itself (the stripped-down fragment of their message,
 * not the greeting around it), so every demand traces back to something they
 * actually wrote. A request with no specifics returns nothing and leaves the
 * ordinary score to choose, which is how "send me a pic" keeps working.
 */
export function requestDemands(text: string): Demand[] {
  const demands: Demand[] = [];
  const seen = new Set<string>();

  const add = (kind: DemandKind, required: Array<Set<string>>) => {
    if (required.length === 0) return;
    const key = `${kind}|${required
      .map((options) => [...options].sort().join(","))
      .sort()
      .join(";")}`;
    if (seen.has(key)) return;
    seen.add(key);
    demands.push({ kind, required });
  };

  for (const token of tokensOf(text)) {
    const family = FAMILY_BY_STEM.get(token);
    if (family) add(family.kind, [family.words]);
  }

  const normalised = ` ${text.toLowerCase().replace(/[^a-z0-9]+/g, " ")} `;
  for (const concept of PHRASE_CONCEPTS) {
    const phrase = concept.forms[0];
    if (!phrase) continue;
    const pattern = phrase.replace(/[^a-z0-9]+/g, " ").trim().split(" ").join("\\s+");
    if (!new RegExp(`\\b${pattern}\\b`).test(normalised)) continue;
    // Every word of the phrase has to be in the photo — "living room" means
    // the room too — except the glue words, which tokensOf already drops.
    const required = tokensOf(phrase).map(
      (token) => FAMILY_BY_STEM.get(token)?.words ?? new Set([token]),
    );
    add(concept.kind, required);
  }

  return demands;
}

/**
 * Does this text (a scene line, a caption) show everything the request named?
 * A photo — or a scene to generate from — only counts when every idea in the
 * request is present, alternatives aside: red **and** dress, not either.
 */
export function textFits(text: string, demands: readonly Demand[]): boolean {
  if (demands.length === 0) return true;
  const words = matchingWords(text);
  return demands.every((demand) =>
    demand.required.every((options) => {
      for (const option of options) {
        if (words.has(option)) return true;
      }
      return false;
    }),
  );
}

/** Does this photo in her roll genuinely show what the request asked for? */
export function photoFits(
  candidate: GalleryCandidate,
  demands: readonly Demand[],
): boolean {
  if (demands.length === 0) return true;
  return textFits(`${candidate.label} ${candidate.tags.join(" ")}`, demands);
}
