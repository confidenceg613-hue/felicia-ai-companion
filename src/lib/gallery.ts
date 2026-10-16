/**
 * Felicia's permanent gallery.
 *
 * These photos are part of the app itself rather than a user's Convex storage,
 * so they are always in her album — for every account and on every deployment —
 * and never depend on image generation, on a backend key, or on clearing the
 * conversation. The files are hosted externally and referenced by their direct
 * image URLs, which keeps the bundle small.
 */

export type GalleryPhoto = {
  /** Stable key for React and for looking a photo up by URL. */
  id: string;
  /** Direct image URL (no gallery page wrapper). */
  url: string;
  /** Caption shown in the lightbox and used as the alt text. */
  title: string;
};

export const FELICIA_GALLERY: readonly GalleryPhoto[] = [
  {
    id: "portrait-natural-light",
    url: "https://i.postimg.cc/HVLQhtCj/1113447a-e7a9-41f7-b426-cc81e34f04e1.png",
    title: "Portrait, natural light",
  },
  {
    id: "braided-chef-red-kitchen",
    url: "https://i.postimg.cc/fSR01M1z/Braided-Chef-in-a-Red-Kitchen-Outfit.png",
    title: "Braided chef in a red kitchen",
  },
  {
    id: "cozy-bedroom-braids",
    url: "https://i.postimg.cc/Yv5YjKLb/Cozy-Bedroom-Portrait-with-Braids.png",
    title: "Cozy bedroom portrait with braids",
  },
  {
    id: "portrait-quiet-moment",
    url: "https://i.postimg.cc/872MsQf0/d7a7203d-a3e2-4739-b540-16b5cf1ac6ad-(1).png",
    title: "Portrait, quiet moment",
  },
  {
    id: "portrait-soft-light",
    url: "https://i.postimg.cc/HrqXjD8v/fefe7e82-f70c-48da-9ace-bc843d7c4e3a.png",
    title: "Portrait, soft light",
  },
  {
    id: "playful-modern-kitchen",
    url: "https://i.postimg.cc/5j4vXmjV/Playful-Pose-in-a-Modern-Kitchen.png",
    title: "Playful pose in a modern kitchen",
  },
  {
    id: "red-dress-kitchen",
    url: "https://i.postimg.cc/xqfHXPqQ/Playful-Red-Dress-Kitchen-Portrait.png",
    title: "Red dress in the kitchen",
  },
  {
    id: "red-dress-bedroom",
    url: "https://i.postimg.cc/rKYSXt89/Relaxed-Red-Dress-Bedroom-Portrait.png",
    title: "Red dress, bedroom light",
  },
  {
    id: "red-dress-sofa",
    url: "https://i.postimg.cc/tZ5xrsv0/Relaxed-Red-Dress-on-the-Sofa.png",
    title: "Red dress on the sofa",
  },
];
