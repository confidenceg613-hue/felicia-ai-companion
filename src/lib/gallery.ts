/**
 * Felicia's permanent gallery.
 *
 * These photos are part of the app itself rather than a user's Convex storage,
 * so they are always in her album — for every account and on every deployment —
 * and never depend on image generation, on a backend key, or on clearing the
 * conversation. The files are hosted externally and referenced by their direct
 * image URLs, which keeps the bundle small.
 *
 * `about` and `tags` are how she knows what each picture is. They are what the
 * conversation is matched against when she decides to send one from her roll
 * instead of taking a new photo, so they are written as descriptions of the
 * picture rather than as a prompt for generating it.
 */

export type GalleryPhoto = {
  /** Stable key for React and for looking a photo up by URL. */
  id: string;
  /** Direct image URL (no gallery page wrapper). */
  url: string;
  /** Caption shown in the lightbox and used as the alt text. */
  title: string;
  /** One sentence saying what is in the picture, in her voice. */
  about: string;
  /** Words that describe the picture, for matching it to a conversation. */
  tags: readonly string[];
};

export const FELICIA_GALLERY: readonly GalleryPhoto[] = [
  {
    id: "portrait-natural-light",
    url: "https://i.postimg.cc/HVLQhtCj/1113447a-e7a9-41f7-b426-cc81e34f04e1.png",
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
    url: "https://i.postimg.cc/fSR01M1z/Braided-Chef-in-a-Red-Kitchen-Outfit.png",
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
      "cooking for someone",
    ],
  },
  {
    id: "cozy-bedroom-braids",
    url: "https://i.postimg.cc/Yv5YjKLb/Cozy-Bedroom-Portrait-with-Braids.png",
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
      "winding down",
      "braids",
      "cozy",
      "home",
      "quiet",
    ],
  },
  {
    id: "portrait-quiet-moment",
    url: "https://i.postimg.cc/872MsQf0/d7a7203d-a3e2-4739-b540-16b5cf1ac6ad-(1).png",
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
    url: "https://i.postimg.cc/HrqXjD8v/fefe7e82-f70c-48da-9ace-bc843d7c4e3a.png",
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
    url: "https://i.postimg.cc/5j4vXmjV/Playful-Pose-in-a-Modern-Kitchen.png",
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
    url: "https://i.postimg.cc/xqfHXPqQ/Playful-Red-Dress-Kitchen-Portrait.png",
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
    url: "https://i.postimg.cc/rKYSXt89/Relaxed-Red-Dress-Bedroom-Portrait.png",
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
    url: "https://i.postimg.cc/tZ5xrsv0/Relaxed-Red-Dress-on-the-Sofa.png",
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
];
