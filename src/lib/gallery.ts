/**
 * Felicia's permanent gallery.
 *
 * These photos are part of the app itself rather than a user's Convex storage,
 * so they are always in her album — for every account and on every deployment —
 * and never depend on image generation, on a backend key, or on clearing the
 * conversation. The files are hosted externally and referenced by their direct
 * image URLs, which keeps the bundle small.
 *
 * Each entry carries two URLs for the same picture:
 *
 *   url      the ~600×800 copy, used for the grid. Small enough that scrolling
 *            the whole album stays cheap, sharp enough for the thumbnails.
 *   fullUrl  the original upload, used for the lightbox, the profile picture
 *            and anything shown at size. This is the copy that was missing
 *            before: the album used to point every tile at the *thumbnail*
 *            variant of the file, which is why her photos always looked soft
 *            and slightly blurred when opened.
 *
 * `about` and `tags` are how she knows what each picture is. They are what the
 * conversation is matched against when she decides to send one from her roll
 * instead of taking a new photo, so they are written as descriptions of the
 * picture rather than as a prompt for generating it.
 */

export type GalleryPhoto = {
  /** Stable key for React and for looking a photo up by URL. */
  id: string;
  /** Grid copy: direct image URL, sized for a tile. */
  url: string;
  /** Original-resolution copy: direct image URL, for the lightbox and avatars. */
  fullUrl: string;
  /** Caption shown in the lightbox and used as the alt text. */
  title: string;
  /** One sentence saying what is in the picture, in her voice. */
  about: string;
  /** Words that describe the picture, for matching it to a conversation. */
  tags: readonly string[];
};

/**
 * Where one photo lives on postimg.
 *
 * `host` is the id of the ~600×800 copy, `full` the id of the original, and
 * `file` the upload's file name — the same file name on both, which is what
 * makes one upload addressable at two sizes.
 */
type GallerySeed = {
  id: string;
  host: string;
  full: string;
  file: string;
  title: string;
  about: string;
  tags: readonly string[];
};

const GALLERY_SEEDS = [
  /* ---------------------------------------------------------------- her roll */
  {
    id: "portrait-natural-light",
    host: "TYVChk7j",
    full: "nZ55RgqW",
    file: "1113447a-e7a9-41f7-b426-cc81e34f04e1.png",
    title: "Portrait, natural light",
    about:
      "Sitting by the window in the late afternoon, no makeup on, hair loose, watching the street below.",
    tags: [
      "window",
      "afternoon",
      "daytime",
      "quiet",
      "natural light",
      "portrait",
      "home",
      "calm",
      "soft light",
      "casual",
      "ordinary evening",
    ],
  },
  {
    id: "braided-chef-red-kitchen",
    host: "NF179M4H",
    full: "RSYPYJJX",
    file: "Braided-Chef-in-a-Red-Kitchen-Outfit.png",
    title: "Braided chef in a red kitchen",
    about:
      "In the kitchen with her braids pinned up and an apron on, mid-cook, laughing at something just out of frame.",
    tags: [
      "kitchen",
      "cooking",
      "cook",
      "food",
      "jollof",
      "dinner",
      "suya",
      "apron",
      "chef",
      "braids",
      "laughing",
      "eating",
      "recipe",
    ],
  },
  {
    id: "cozy-bedroom-braids",
    host: "3wRBS385",
    full: "WsmH44x3",
    file: "Cozy-Bedroom-Portrait-with-Braids.png",
    title: "Cozy bedroom portrait with braids",
    about:
      "Late at night in the bedroom, braids down, propped up against the pillows with the lamp on.",
    tags: [
      "bedroom",
      "bed",
      "night",
      "late",
      "tired",
      "sleepy",
      "sleep",
      "awake",
      "insomnia",
      "lying in bed",
      "lamp",
      "braids",
      "cozy",
      "home",
      "quiet",
    ],
  },
  {
    id: "portrait-quiet-moment",
    host: "872MsQf0",
    full: "872MsQf0",
    file: "d7a7203d-a3e2-4739-b540-16b5cf1ac6ad-(1).png",
    title: "Portrait, quiet moment",
    about:
      "A still moment between takes, looking away from the camera, thinking about something else entirely.",
    tags: [
      "quiet",
      "thinking about you",
      "thoughtful",
      "pensive",
      "serious",
      "still",
      "portrait",
      "calm",
      "grief",
      "reflective",
    ],
  },
  {
    id: "portrait-soft-light",
    host: "43d5LXfG",
    full: "jR6FjjBD",
    file: "fefe7e82-f70c-48da-9ace-bc843d7c4e3a.png",
    title: "Portrait, soft light",
    about:
      "Soft even light, head turned slightly away, with a small smile that nobody asked for.",
    tags: [
      "smile",
      "smiling",
      "happy",
      "good mood",
      "soft",
      "gentle",
      "warm",
      "portrait",
      "flirty",
    ],
  },
  {
    id: "playful-modern-kitchen",
    host: "ZY3LD7SC",
    full: "szH0xqH9",
    file: "Playful-Pose-in-a-Modern-Kitchen.png",
    title: "Playful pose in a modern kitchen",
    about:
      "Leaning on the counter of a bright modern kitchen, pulling a face at the camera, mid-laugh.",
    tags: [
      "kitchen",
      "playful",
      "silly",
      "funny",
      "joking",
      "laughing",
      "teasing",
      "counter",
      "morning",
      "coffee",
      "tea",
      "breakfast",
      "cheeky",
    ],
  },
  {
    id: "red-dress-kitchen",
    host: "J7JQd6Ls",
    full: "vy2STk2t",
    file: "Playful-Red-Dress-Kitchen-Portrait.png",
    title: "Red dress in the kitchen",
    about:
      "In the red dress in the kitchen, dancing badly to one of her father's records with a wooden spoon in one hand.",
    tags: [
      "red dress",
      "dress",
      "dancing",
      "dance",
      "music",
      "records",
      "fela",
      "kitchen",
      "date",
      "date night",
      "going out",
      "party",
      "evening",
      "celebrating",
      "happy",
    ],
  },
  {
    id: "red-dress-bedroom",
    host: "CxwJ8jX9",
    full: "tpxcLk5R",
    file: "Relaxed-Red-Dress-Bedroom-Portrait.png",
    title: "Red dress, bedroom light",
    about:
      "Getting ready to go out, in the red dress, checking herself in the bedroom mirror.",
    tags: [
      "red dress",
      "dress",
      "getting ready",
      "going out",
      "mirror",
      "evening",
      "party",
      "date",
      "dinner",
      "wedding",
      "birthday",
      "nervous",
      "bedroom",
    ],
  },
  {
    id: "red-dress-sofa",
    host: "7hvnZ7gL",
    full: "6WqjzfqC",
    file: "Relaxed-Red-Dress-on-the-Sofa.png",
    title: "Red dress on the sofa",
    about:
      "Curled up on the sofa in the red dress with her heels off, the night already over.",
    tags: [
      "red dress",
      "dress",
      "sofa",
      "relaxed",
      "heels off",
      "after a long day",
      "evening",
      "night",
      "tired",
      "home",
      "comfortable",
      "resting",
      "quiet",
    ],
  },

  /* ------------------------------------------------- the rest of her camera roll */
  {
    id: "roll-quiet-morning",
    host: "NfLDFbHm",
    full: "k9vpjpM1",
    file: "00c9f1f7-4349-453a-9828-9654292a0e35.png",
    title: "Quiet morning",
    about:
      "First light through the curtains, still in yesterday's shirt, hair still a mess.",
    tags: ["morning", "early", "bedroom", "home", "soft light", "portrait", "cozy"],
  },
  {
    id: "roll-after-the-rain",
    host: "vTZzWtSy",
    full: "Jrb2CTNs",
    file: "0ad4cac5-925b-4e5c-88c5-e9912d0f35e9.png",
    title: "After the rain",
    about:
      "Out on the balcony just after the rain stopped, hair drying, grey light everywhere.",
    tags: ["rain", "weather", "balcony", "evening", "portrait", "moody", "quiet"],
  },
  {
    id: "roll-studio-lamp",
    host: "j23hvnGN",
    full: "MZqr6y5s",
    file: "1fb57f4c-3941-4216-b5e4-92f3e74011ff.png",
    title: "Studio lamp",
    about:
      "In front of the lamp she hates, waiting for the light to be right, arms folded.",
    tags: ["studio", "working", "photography", "shoot", "portrait", "focused"],
  },
  {
    id: "roll-sunday-market",
    host: "QCdbpJnX",
    full: "mLQ5WdYF",
    file: "3a5cf56e-48c0-448f-82e9-33f33cf28793.png",
    title: "Sunday at the market",
    about:
      "At Balogun with her mother, bags on both arms, laughing about something her mother just said.",
    tags: ["market", "lagos", "sunday", "shopping", "family", "mother", "laughing", "daytime"],
  },
  {
    id: "roll-roof-light",
    host: "XNsxntpX",
    full: "z5rQFrNw",
    file: "46ea09ff-b229-41d6-a8d4-50bf4a3c3c52.png",
    title: "Roof light",
    about:
      "Up on the roof of her building at golden hour, the city far below, squinting into the sun.",
    tags: ["rooftop", "golden hour", "sunset", "lagos", "city", "portrait", "warm"],
  },
  {
    id: "roll-late-train-home",
    host: "FzCxGk2s",
    full: "RC4bScdf",
    file: "476c482c-4246-4792-8ffe-6b2c422d7ef8.png",
    title: "Late train home",
    about: "Coming home late, head against the window, streetlights sliding past.",
    tags: ["train", "late", "night", "commute", "tired", "city", "window"],
  },
  {
    id: "roll-film-day",
    host: "Xq1gxBTB",
    full: "3rYb8g11",
    file: "49f8f2ee-0fdf-4a49-ad8a-6d5428a38c43.png",
    title: "Film day",
    about:
      "Camera on her shoulder, the Pentax in the other hand, half-listening to a client on speaker.",
    tags: ["working", "camera", "documentary", "filming", "work", "portrait", "focused"],
  },
  {
    id: "roll-cafe-corner",
    host: "ZnsLjv1z",
    full: "8kNnph4c",
    file: "4d547ec4-5f05-4562-99d4-d390f3b1f67e.png",
    title: "Café corner",
    about:
      "The back corner table, coffee going cold, notebook open, chewing the end of a pen.",
    tags: ["cafe", "coffee", "writing", "afternoon", "quiet", "portrait", "thinking"],
  },
  {
    id: "roll-golden-hour",
    host: "5yKmpQZx",
    full: "VsmHfjgb",
    file: "7b1f9da8-b2ef-44ab-8859-db81de92fd1f.png",
    title: "Golden hour",
    about:
      "The twenty minutes of light she waits all day for, standing in it with her eyes closed.",
    tags: ["golden hour", "sunset", "warm", "evening", "light", "portrait", "happy"],
  },
  {
    id: "roll-night-shoot",
    host: "3rt93zdJ",
    full: "WjvywvVr",
    file: "7cbebee4-f10c-4c09-8e2a-d8122e66ead5.png",
    title: "Night shoot",
    about:
      "Out filming the women who work at night — the project she cares about most — long after dark.",
    tags: ["night", "working", "documentary", "city", "lagos", "cinematic", "portrait"],
  },
  {
    id: "roll-window-seat",
    host: "4y21wHrb",
    full: "ryMYVSjb",
    file: "8ea33b1e-2bd6-407c-bf54-bb6272ddada4.png",
    title: "Window seat",
    about: "Curled into the window seat with a paperback, feet tucked under her.",
    tags: ["window", "reading", "book", "quiet", "home", "daytime", "cozy"],
  },
  {
    id: "roll-candlelit",
    host: "hPhsvMdj",
    full: "2m7KHKj4",
    file: "9ce871e5-3043-488c-884f-dd23936c0e67.png",
    title: "Candlelit",
    about:
      "Power cut again, so candles — sitting on the floor with the last of the wine, pretending it is romantic.",
    tags: ["night", "candle", "home", "power cut", "wine", "quiet", "portrait"],
  },
  {
    id: "roll-back-street",
    host: "Fs1pzGL7",
    full: "wHQGWGxc",
    file: "acab0a27-3b85-497e-93f3-4b407cdb34ae.png",
    title: "Back street",
    about:
      "Cutting through the back streets on the way home, bag on her shoulder, watching her own feet.",
    tags: ["street", "walking", "lagos", "evening", "city", "casual", "portrait"],
  },
  {
    id: "roll-balcony-dusk",
    host: "Dym605XX",
    full: "6wfmHm6Y",
    file: "b837552c-769e-411f-afa6-f28534d8c231.png",
    title: "Balcony dusk",
    about: "Barefoot on the balcony at dusk, the generator humming below, taking a breath.",
    tags: ["balcony", "dusk", "evening", "home", "quiet", "calm", "portrait"],
  },
  {
    id: "roll-editorial",
    host: "1X7KMVL0",
    full: "ZY4DbrHQ",
    file: "Chat-GPT-Image-Oct-17-2026-04-46-54-PM.png",
    title: "Brand shoot",
    about:
      "The sponsored one she rolls her eyes about — full lighting rig, cool and composed for the client.",
    tags: ["brand", "work", "editorial", "camera", "posed", "studio", "portrait"],
  },
  {
    id: "roll-soft-focus",
    host: "T3zCZmhc",
    full: "8T59fmSx",
    file: "Chat-GPT-Image-Oct-17-2026-09-55-20-AM.png",
    title: "Soft focus",
    about: "Shot on the old lens, everything slightly dreamlike, nobody quite in focus.",
    tags: ["soft", "dreamy", "portrait", "warm", "gentle", "calm"],
  },
  {
    id: "roll-colour-test",
    host: "pTxkdHfz",
    full: "zJHQ0D3t",
    file: "Chat-GPT-Image-Oct-17-2026-09-55-35-AM.png",
    title: "Colour test",
    about: "Testing a roll of film in the kitchen, holding a strip of prints up to the light.",
    tags: ["film", "prints", "kitchen", "portrait", "curious", "daytime"],
  },
  {
    id: "roll-warm-lamp",
    host: "26wGbKGK",
    full: "NshzVhHB",
    file: "Chat-GPT-Image-Oct-17-2026-09-55-48-AM.png",
    title: "Warm lamp",
    about: "Late evening, one lamp on, in a jumper that is too big for her.",
    tags: ["evening", "lamp", "warm", "home", "cozy", "portrait", "calm"],
  },
  {
    id: "roll-cool-daylight",
    host: "hvtr91Zs",
    full: "mLQ5WdQv",
    file: "Chat-GPT-Image-Oct-17-2026-09-56-12-AM.png",
    title: "Cool daylight",
    about: "Flat grey morning light, no filter, saying she does not want the picture taken.",
    tags: ["morning", "daytime", "grey", "portrait", "serious", "natural light"],
  },
  {
    id: "roll-streetlights",
    host: "JnqxD2xd",
    full: "0kgB3gwx",
    file: "Chat-GPT-Image-Oct-17-2026-09-56-29-AM.png",
    title: "Under the streetlights",
    about: "Waiting for a ride under the streetlights, hands in her pockets, tired and glad.",
    tags: ["night", "street", "city", "late", "evening", "cinematic", "portrait"],
  },
  {
    id: "roll-print-day",
    host: "3NxBgFfb",
    full: "qJ85Hms0",
    file: "Chat-GPT-Image-Oct-17-2026-09-56-48-AM.png",
    title: "Print day",
    about: "The kitchen table covered in drying prints, hair up, squinting at a contact sheet.",
    tags: ["prints", "darkroom", "kitchen", "working", "photography", "daytime"],
  },
  {
    id: "roll-hair-loose",
    host: "qqvL8xDF",
    full: "8ph0gyRT",
    file: "Chat-GPT-Image-Oct-17-2026-09-57-19-AM.png",
    title: "Hair loose",
    about: "Hair down for once, caught mid-turn, the shutter a second too early.",
    tags: ["hair", "portrait", "candid", "laughing", "playful", "warm"],
  },
  {
    id: "roll-morning-light",
    host: "j2SXz4kr",
    full: "fzxrQHck",
    file: "Chat-GPT-Image-Oct-17-2026-10-12-47-AM.png",
    title: "Morning light",
    about: "Curtains open, light across the whole bed, still not getting up.",
    tags: ["morning", "bed", "bedroom", "lazy", "home", "soft light", "cozy"],
  },
  {
    id: "roll-rain-window",
    host: "8kZwTxsn",
    full: "dvYfjYFv",
    file: "d13d0d6e-41ca-4cbd-b7ca-eb41a2e89de8.png",
    title: "Rain window",
    about: "Watching the rain come in sideways through the window she refuses to close.",
    tags: ["rain", "window", "quiet", "home", "grey", "moody", "portrait"],
  },
  {
    id: "roll-quiet-room",
    host: "xj6g9BcS",
    full: "NYcnkctL",
    file: "d34c03f7-e5d0-453d-95e8-b80fae1513cd.png",
    title: "Quiet room",
    about: "Sitting on the floor of the studio between takes, phone in hand, half smiling.",
    tags: ["quiet", "studio", "portrait", "relaxed", "smiling", "calm"],
  },
  {
    id: "roll-hard-light",
    host: "sxHJKGtv",
    full: "XN4DjwLc",
    file: "d5787358-1eff-495b-a625-d9d70289cb3e.png",
    title: "Hard light",
    about: "Hard afternoon sun through the blinds, stripes across her face, uncompromising.",
    tags: ["afternoon", "sun", "portrait", "striking", "serious", "natural light"],
  },
  {
    id: "roll-last-frame",
    host: "yxpTn3wd",
    full: "xjnFfK5K",
    file: "e3548ba3-406d-430e-adfc-00fcf608aca5.png",
    title: "Last frame",
    about: "End of the roll, unguarded and laughing at whoever is holding the camera.",
    tags: ["laughing", "happy", "candid", "portrait", "warm", "playful"],
  },
] as const satisfies readonly GallerySeed[];

/** Her gallery, with one upload exposed at both of its sizes. */
export const FELICIA_GALLERY: readonly GalleryPhoto[] = GALLERY_SEEDS.map(
  (photo) => ({
    id: photo.id,
    url: `https://i.postimg.cc/${photo.host}/${photo.file}`,
    fullUrl: `https://i.postimg.cc/${photo.full}/${photo.file}?dl=1`,
    title: photo.title,
    about: photo.about,
    tags: photo.tags,
  }),
);

/** The id of one of her photos, checked at compile time. */
export type GalleryPhotoId = (typeof GALLERY_SEEDS)[number]["id"];

/**
 * One of her photos by id.
 *
 * Pages that are built around a particular picture — the portrait on the front
 * page, the avatar in the chat — name it here rather than hardcoding a URL, so
 * swapping the picture is a one-line change and a mistyped id is a type error
 * instead of a broken image.
 */
export function galleryPhoto(id: GalleryPhotoId | string): GalleryPhoto {
  const photo = FELICIA_GALLERY.find((candidate) => candidate.id === id);
  if (!photo) {
    throw new Error(`No such photo in her gallery: ${id}`);
  }
  return photo;
}
