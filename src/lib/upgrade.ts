// Where the guest's user id waits between "Make this permanent" on Settings
// and the moment the email sign-in resolves on /auth. sessionStorage rather
// than memory so an accidental reload on the auth screen doesn't strand it —
// and it dies with the tab, so nothing lingers after.
export const GUEST_MERGE_KEY = "felicia:claim-guest";