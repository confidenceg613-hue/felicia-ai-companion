declare global {
  interface Window {
    /**
     * Navigate to the auth page with a custom redirect URL
     * @param redirectUrl - URL to redirect to after successful authentication
     */
    navigateToAuth: (redirectUrl: string) => void;

    /**
     * Puter.js, injected by <script src="https://js.puter.com/v2/">.
     *
     * Only the slice Felicia uses is typed here: text-to-image for her selfies.
     * The SDK resolves to an image element in the documented example, but the
     * shape has varied across releases, so the helper in lib/puter.ts accepts
     * an element, a URL string, an array, or an object carrying `src`/`url`.
     */
    puter?: {
      ai?: {
        txt2img?: (prompt: string) => Promise<unknown>;
      };
      auth?: {
        signIn?: () => Promise<unknown>;
        isSignedIn?: () => Promise<boolean>;
      };
    };
  }
}

export {};
