import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";

import { useAuth } from "@/hooks/use-auth";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { GUEST_MERGE_KEY } from "@/lib/upgrade";
import { friendlyError, isTransientError } from "@/lib/utils";
import logo from "@/assets/logo.svg";
import { ArrowRight, Loader2, Mail, UserX } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { Suspense, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";

interface AuthProps {
  redirectAfterAuth?: string;
}

// Set just before leaving for Google, cleared when we get back. It has to live
// in sessionStorage because the OAuth round trip is a full page navigation.
const GOOGLE_PENDING_KEY = "felicia:google-signin";

/**
 * What a failed send means in words, not in a Convex banner.
 *
 * The email sender rate-limits by address — and a user who never got the code
 * will inevitably tap again and again, so the limit hitting is a normal part of
 * the flow, not an exception to print. When the server says how long to wait,
 * the sentence repeats it; otherwise it keeps it vague enough to always be
 * true.
 */
function signEmailError(error: unknown, fallback: string): string {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  if (/429|rate.?limit|too many/i.test(raw)) {
    const match = raw.match(/retry after (\d+)/i);
    const seconds = match ? Number(match[1]) : null;
    const wait = seconds
      ? `${Math.max(1, Math.ceil(seconds / 60))} minute${Math.ceil(seconds / 60) > 1 ? "s" : ""}`
      : "a few minutes";
    return `Too many codes were sent to this email. Please wait about ${wait}, and if a code already arrived, use that — no new one is needed.`;
  }
  if (/VLY_INTEGRATION_KEY/i.test(raw)) {
    return "The email sender isn't set up for this app yet. Try signing in with Google instead.";
  }
  return friendlyError(error, fallback);
}

function resolveRedirectAfterAuth(
  returnTo: string | null,
  fallback = "/dashboard",
) {
  if (returnTo?.startsWith("/") && !returnTo.startsWith("//")) {
    return returnTo;
  }
  return fallback;
}

function Auth({ redirectAfterAuth }: AuthProps = {}) {
  const { isLoading: authLoading, isAuthenticated, signIn } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirect = resolveRedirectAfterAuth(
    searchParams.get("returnTo"),
    redirectAfterAuth,
  );
  // /auth?upgrade=1: we arrived here FROM a guest session to make it permanent,
  // so the auto-redirect below must not bounce us back before the code arrives.
  const upgradeMode = searchParams.get("upgrade") === "1";
  const claimGuest = useMutation(api.accounts.claimGuestConversation);
  // Only offer Google once its credentials exist on the deployment, so the
  // button can never be a dead end.
  const providers = useQuery(api.authProviders.enabled);
  const googleReady = providers?.google === true;
  const [step, setStep] = useState<"signIn" | { email: string }>("signIn");
  const [otp, setOtp] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // In upgrade mode the guest is already authenticated — staying put is the
    // whole point, until the OTP submit below carries the conversation over.
    if (!authLoading && isAuthenticated && !upgradeMode) {
      navigate(redirect);
    }
  }, [authLoading, isAuthenticated, navigate, redirect, upgradeMode]);

  /**
   * Move the guest conversation to the account that just signed in. Nothing is
   * ever deleted: a failure leaves the history under the guest id and says so,
   * rather than blocking the sign-in.
   */
  const carryGuestOver = async () => {
    const fromUserId = sessionStorage.getItem(GUEST_MERGE_KEY);
    if (!fromUserId) return;
    try {
      await claimGuest({ fromUserId: fromUserId as Id<"users"> });
      toast.success("Your conversation is now permanent.");
    } catch (carryError) {
      console.warn("Could not carry the guest conversation over:", carryError);
      toast.error(
        "Signed in — but the conversation couldn't be carried over this time.",
      );
    } finally {
      sessionStorage.removeItem(GUEST_MERGE_KEY);
    }
  };

  // Google sends the browser off-site and back, so its carry-over can't run in
  // the click handler. The pending flag set at click time survives the round
  // trip and lands us here once the new session is live.
  useEffect(() => {
    if (!upgradeMode || authLoading || !isAuthenticated) return;
    if (sessionStorage.getItem(GOOGLE_PENDING_KEY) !== "1") return;
    sessionStorage.removeItem(GOOGLE_PENDING_KEY);
    void carryGuestOver().finally(() => navigate(redirect));
    // carryGuestOver is re-created each render; the flag above makes re-runs
    // harmless no-ops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [upgradeMode, authLoading, isAuthenticated, navigate, redirect]);

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    setError(null);
    const params = new URLSearchParams({ returnTo: redirect });
    if (sessionStorage.getItem(GUEST_MERGE_KEY)) {
      // There is a guest conversation to keep, so come back to this card in
      // upgrade mode instead of heading straight for the app.
      params.set("upgrade", "1");
      sessionStorage.setItem(GOOGLE_PENDING_KEY, "1");
    }

    // Google won't render its consent screen inside an iframe, and the preview
    // lives in one. Hand the flow to a full tab of the same app: same origin,
    // so the session it creates is the one this preview uses, and the consent
    // screen loads where Google allows it.
    if (window.self !== window.top) {
      const tab = window.open(`/auth?${params.toString()}&google=1`, "_blank");
      if (tab) {
        toast("Finishing Google sign-in in a new tab.");
        setIsLoading(false);
        return;
      }
    }

    try {
      // Absolute, because the deployment's SITE_URL is its .convex.site origin,
      // not the address of the app itself.
      await signIn("google", {
        redirectTo: `${window.location.origin}/auth?${params.toString()}`,
      });
    } catch (error) {
      console.error("Google sign-in error:", error);
      sessionStorage.removeItem(GOOGLE_PENDING_KEY);
      setError(
        error instanceof Error
          ? error.message
          : "Google sign-in failed. Please try again.",
      );
      setIsLoading(false);
    }
  };

  // ?google=1 is how the preview hands the flow to a full tab. That tab starts
  // the consent screen itself, so the whole sign-in is still one click. The
  // OAuth callback never carries this param, so it can't re-trigger on return.
  const googleAutoStarted = useRef(false);
  useEffect(() => {
    if (searchParams.get("google") !== "1") return;
    if (authLoading || isAuthenticated || !googleReady) return;
    if (googleAutoStarted.current) return;
    googleAutoStarted.current = true;
    void handleGoogleSignIn();
    // handleGoogleSignIn is re-created each render; the ref above makes this
    // run exactly once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, authLoading, isAuthenticated, googleReady]);

  const handleEmailSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      const formData = new FormData(event.currentTarget);
      await signIn("email-otp", formData);
      setStep({ email: formData.get("email") as string });
      setIsLoading(false);
    } catch (error) {
      console.error("Email sign-in error:", error);
      setError(
        signEmailError(error, "Failed to send verification code. Please try again."),
      );
      setIsLoading(false);
    }
  };

  const handleOtpSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      const formData = new FormData(event.currentTarget);
      await signIn("email-otp", formData);

      // Upgrade: the session is now the email account — pull the guest
      // conversation across before landing on it.
      if (upgradeMode) await carryGuestOver();

      navigate(redirect);
    } catch (error) {
      console.error("OTP verification error:", error);

      const raw = error instanceof Error ? error.message : String(error ?? "");
      setError(
        /rate.?limit|too many/i.test(raw)
          ? "Too many attempts — please wait a few minutes, then request a new code."
          : "The verification code you entered is incorrect.",
      );
      setIsLoading(false);

      setOtp("");
    }
  };

  const handleGuestLogin = async () => {
    setIsLoading(true);
    setError(null);
    try {
      console.log("Attempting anonymous sign in...");
      await signIn("anonymous");
      console.log("Anonymous sign in successful");
      navigate(redirect);
    } catch (error) {
      // Network blips during the first hop are retryable; when they clear
      // the user should be told to try again, not shown the server's raw
      // banner — the Dashboard already uses the same logic for the same reason.
      if (isTransientError(error)) {
        setError(
          "The connection dipped for a second — your device just kept itself close enough.",
        );
      } else {
        setError(
          error instanceof Error
                       ? friendlyError(error, "Couldn't start a guest session.")
            : "Failed to start a guest session.",
        );
      }
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">

      
      {/* Auth Content */}
      <div className="flex-1 flex items-center justify-center">
        <div className="glow-warm relative flex items-center justify-center h-full flex-col px-6">
        <motion.div
          initial={{ opacity: 0, y: 22, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        >
        <Card className="min-w-[350px] rounded-3xl border-border/60 bg-card/85 p-0 shadow-[0_40px_80px_-48px_rgba(24,14,44,0.55)] ring-1 ring-foreground/5 backdrop-blur-xl">
          <AnimatePresence mode="wait" initial={false}>
          {step === "signIn" ? (
            <motion.div
              key="email"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            >
              <CardHeader className="text-center">
              <div className="flex justify-center">
                    <img
                      src={logo}
                      alt="Lock Icon"
                      width={64}
                      height={64}
                      className="rounded-2xl mb-4 mt-4 cursor-pointer ring-1 ring-border/60"
                      onClick={() => navigate("/")}
                    />
                  </div>
                <CardTitle className="font-display text-2xl tracking-tight">
                  {upgradeMode ? "Keep this conversation" : "Get Started"}
                </CardTitle>
                <CardDescription>
                  {upgradeMode
                    ? "Tie everything you and Felicia have said to your account — it survives sign-out, and it follows you to any device."
                    : "Sign in with Google or your email. Everything you and Felicia say is kept on your account, so signing out and back in later picks the conversation up exactly where it stopped."}
                </CardDescription>
              </CardHeader>
              <form onSubmit={handleEmailSubmit}>
                <CardContent>
                  {googleReady && (
                    <div className="mb-4">
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full rounded-full"
                        onClick={handleGoogleSignIn}
                        disabled={isLoading}
                      >
                        <GoogleMark className="mr-2 h-4 w-4" />
                        Continue with Google
                      </Button>
                      <div className="relative mt-4">
                        <div className="absolute inset-0 flex items-center">
                          <span className="w-full border-t" />
                        </div>
                        <div className="relative flex justify-center text-xs uppercase">
                          <span className="bg-card px-2 text-muted-foreground">
                            Or
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="relative flex items-center gap-2">
                    <div className="relative flex-1">
                      <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        name="email"
                        placeholder="name@example.com"
                        type="email"
                        className="pl-9 rounded-full"
                        disabled={isLoading}
                        required
                      />
                    </div>
                    <Button
                      type="submit"
                      variant="outline"
                      size="icon"
                      disabled={isLoading}
                    >
                      {isLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <ArrowRight className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  {error && (
                    <p className="mt-2 text-sm text-red-500">{error}</p>
                  )}
                  
                  {!upgradeMode && (
                  <div className="mt-4">
                    <div className="relative">
                      <div className="absolute inset-0 flex items-center">
                        <span className="w-full border-t" />
                      </div>
                      <div className="relative flex justify-center text-xs uppercase">
                        <span className="bg-background px-2 text-muted-foreground">
                          Or
                        </span>
                      </div>
                    </div>
                    
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full mt-4"
                      onClick={handleGuestLogin}
                      disabled={isLoading}
                    >
                      <UserX className="mr-2 h-4 w-4" />
                      Continue as a guest
                    </Button>
                    <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                      A guest account is tied to this device: sign out and the
                      conversation is left behind, and a new guest sign-in starts
                      from nothing. Sign in with your email instead and it is
                      kept permanently — come back on any device and the whole
                      chat is still there.
                    </p>
                  </div>
                  )}
                </CardContent>
              </form>
            </motion.div>
          ) : (
            <motion.div
              key="otp"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            >
              <CardHeader className="text-center mt-4">
                <CardTitle>Check your email</CardTitle>
                <CardDescription>
                  We've sent a code to {step.email}
                </CardDescription>
              </CardHeader>
              <form onSubmit={handleOtpSubmit}>
                <CardContent className="pb-4">
                  <input type="hidden" name="email" value={step.email} />
                  <input type="hidden" name="code" value={otp} />

                  <div className="flex justify-center">
                    <InputOTP
                      value={otp}
                      onChange={setOtp}
                      maxLength={6}
                      disabled={isLoading}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && otp.length === 6 && !isLoading) {
                          // Find the closest form and submit it
                          const form = (e.target as HTMLElement).closest("form");
                          if (form) {
                            form.requestSubmit();
                          }
                        }
                      }}
                    >
                      <InputOTPGroup>
                        {Array.from({ length: 6 }).map((_, index) => (
                          <InputOTPSlot key={index} index={index} />
                        ))}
                      </InputOTPGroup>
                    </InputOTP>
                  </div>
                  {error && (
                    <p className="mt-2 text-sm text-red-500 text-center">
                      {error}
                    </p>
                  )}
                  <p className="text-sm text-muted-foreground text-center mt-4">
                    Didn't receive a code?{" "}
                    <Button
                      variant="link"
                      className="p-0 h-auto"
                      onClick={() => setStep("signIn")}
                    >
                      Try again
                    </Button>
                  </p>
                </CardContent>
                <CardFooter className="flex-col gap-2">
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={isLoading || otp.length !== 6}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Verifying...
                      </>
                    ) : (
                      <>
                        Verify code
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </>
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setStep("signIn")}
                    disabled={isLoading}
                    className="w-full"
                  >
                    Use different email
                  </Button>
                </CardFooter>
              </form>
            </motion.div>
          )}
          </AnimatePresence>

          <div className="py-4 px-6 text-xs text-center text-muted-foreground bg-muted border-t rounded-b-lg">
            Secured by{" "}
            <a
              href="https://freebuff.com"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-primary transition-colors"
            >
              freebuff.com
            </a>
          </div>
        </Card>
        </motion.div>
        </div>
      </div>
    </div>
  );
}

function GoogleMark({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z" />
    </svg>
  );
}

export default function AuthPage(props: AuthProps) {
  return (
    <Suspense>
      <Auth {...props} />
    </Suspense>
  );
}
