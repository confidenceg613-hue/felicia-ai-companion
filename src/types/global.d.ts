declare global {
  interface Window {
    /**
     * Navigate to the auth page with a custom redirect URL
     * @param redirectUrl - URL to redirect to after successful authentication
     */
    navigateToAuth: (redirectUrl: string) => void;
  }
}

export type NonNullableUser =
  | {
      _id: import("convex").Id<"users">;
      _creationTime: number;
      image?: string | undefined;
      name?: string | undefined;
      role?: "admin" | "user" | "member" | undefined;
      email?: string | undefined;
      emailVerificationTime?: number | undefined;
      isAnonymous?: boolean | undefined;
    }
  | null
  | undefined;

export {};
