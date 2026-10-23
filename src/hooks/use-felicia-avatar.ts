import { api } from "@/convex/_generated/api";
import { FELICIA_AVATAR_URL } from "@/lib/felicia";
import { FELICIA_GALLERY } from "@/lib/gallery";
import { useQuery } from "convex/react";

/**
 * Her profile picture, as this account has chosen it.
 *
 * The choice is stored per user and defaults to her portrait, so signed-out
 * pages and fresh accounts get exactly the same picture the app always had.
 * The full-resolution copy is used rather than the grid one — an avatar is
 * small but it is the most-looked-at image in the app, and the thumbnail copy
 * is visibly soft once it is rendered in a retina-sized circle.
 */
export function useFeliciaAvatar(): string {
  const profile = useQuery(api.feliciaAppearance.profile);
  const id = profile?.avatarGalleryId;
  if (!id) return FELICIA_AVATAR_URL;

  // The thumbnail copy, not the original: an avatar is a circle a hundred-odd
  // pixels wide, and the original is a multi-megabyte PNG that every screen
  // showing her face would otherwise wait on.
  return (
    FELICIA_GALLERY.find((photo) => photo.id === id)?.thumbUrl ??
    FELICIA_AVATAR_URL
  );
}
