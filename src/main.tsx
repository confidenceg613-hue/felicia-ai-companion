import "@vly-ai/integrations";
import { Toaster } from "@/components/ui/sonner";
import { RequireAuth } from "@/components/RequireAuth";
import { useAuth } from "@/hooks/use-auth";
import AgeGate from "@/components/AgeGate";
import { VlyToolbar } from "../vly-toolbar-readonly.tsx";
import { pageModules, prefetchPages } from "@/lib/pageModules";
import { resolveConvexUrl } from "@/lib/convexDeployment";
import Landing from "@/pages/Landing";
import AuthPage from "@/pages/Auth";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexReactClient, useConvexAuth } from "convex/react";
import { Heart } from "lucide-react";
import { MotionConfig, motion } from "framer-motion";
import React, { StrictMode, useEffect, useState, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
} from "react-router";
import "./index.css";

// The two public pages are part of the main bundle: they are the first thing
// anyone sees, so a chunk request for them is a delay on the very first paint —
// and, while the dev server is rebuilding, a request that can fail and leave a
// blank screen behind. The signed-in pages stay lazy; the shell warms them the
// moment a session exists.
const AppShell = lazy(pageModules.shell);
const Dashboard = lazy(pageModules.dashboard);
const Memories = lazy(pageModules.memories);
const Album = lazy(pageModules.album);
const SharedNotes = lazy(pageModules.notes);
const Settings = lazy(pageModules.settings);
const NotFound = lazy(pageModules.notFound);

/**
 * The app's boot screen: her heart, beating.
 *
 * It replaces a bare "Loading…". A real heart is a lub-dub — two thumps close
 * together, then a rest — so the beats are timed that way rather than as an
 * even pulse, and the halo and ring breathe with it instead of fading on their
 * own. The whole thing honours the system's reduced-motion setting, because it
 * is wrapped in MotionConfig above.
 */
function RouteLoading() {
  /** One lub-dub, shared by the heart, its halo and its ring. */
  const beat = [1, 1.16, 1.02, 1.09, 1];
  const beatTiming = {
    duration: 1.5,
    // Two thumps, then a rest — the shape of a real heartbeat.
    times: [0, 0.12, 0.24, 0.36, 1],
    repeat: Infinity,
    ease: "easeInOut" as const,
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-7 bg-background">
      <div className="relative flex size-32 items-center justify-center">
        {/* The light it throws on the room behind it. */}
        <motion.span
          aria-hidden
          className="absolute size-32 rounded-full bg-primary/30 blur-2xl"
          animate={{ scale: beat, opacity: [0.45, 0.9, 0.5, 0.8, 0.45] }}
          transition={beatTiming}
        />

        {/* One ring per beat, spreading out and fading like a pulse. */}
        <motion.span
          aria-hidden
          className="absolute size-24 rounded-full border border-primary/30"
          animate={{
            scale: [1, 1.45, 1.05, 1.3, 1],
            opacity: [0.5, 0, 0.35, 0, 0.5],
          }}
          transition={beatTiming}
        />

        <motion.div
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        >
          <motion.div animate={{ scale: beat }} transition={beatTiming}>
            <Heart
              aria-hidden
              className="size-16 fill-primary text-primary"
              strokeWidth={1.25}
            />
          </motion.div>
        </motion.div>
      </div>

      <p className="font-display text-xs tracking-[0.42em] text-muted-foreground/80 uppercase">
        Felicia
      </p>
    </div>
  );
}

/** Silent error boundary — if VlyToolbar crashes it renders nothing instead of
 *  crashing the whole app (e.g. hook errors in the browser runtime). */
class ToolbarErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(err: Error) {
    console.warn("[VlyToolbar] Caught error, toolbar disabled:", err.message);
  }
  render() {
    return this.state.hasError ? null : this.props.children;
  }
}

/** Hard guard so runtime errors never leave the preview as a blank page. */
class RootErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; message: string; stack: string }
> {
  state = { hasError: false, message: "", stack: "" };
  static getDerivedStateFromError(error: Error) {
    return {
      hasError: true,
      message: error.message || "Unknown runtime error",
      stack: error.stack || "",
    };
  }
  componentDidCatch(err: Error) {
    console.error("[Preview] Root crash:", err);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background text-foreground p-6">
          <div className="max-w-lg text-center">
            <p className="text-sm font-semibold">Preview runtime error</p>
            <p className="mt-2 text-xs text-muted-foreground break-words">
              {this.state.message}
            </p>
            {this.state.stack && (
              <pre className="mt-3 text-left text-[10px] leading-4 text-muted-foreground/80 max-h-40 overflow-auto rounded border border-border/60 p-2">
                {this.state.stack}
              </pre>
            )}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

/**
 * The app's front door.
 *
 * "Meet Felicia" is for visitors who are not signed in. Once there is a
 * session, opening the app goes straight into the chat — the landing page
 * would only ever be a screen to click past on the way to the conversation.
 * Signing out ends the session, so the landing page comes back on its own.
 */
function Home() {
  const { isLoading, isAuthenticated, signIn } = useAuth();

  /** The heart never owns the screen: if the backend is slow to answer, the
   *  landing page takes over after a few seconds instead of beating forever. */
  const [authTimedOut, setAuthTimedOut] = useState(false);
  useEffect(() => {
    if (!isLoading) return;
    const timer = setTimeout(() => setAuthTimedOut(true), 4000);
    return () => clearTimeout(timer);
  }, [isLoading]);

  useEffect(() => {
    if (isLoading || isAuthenticated) return;
    void signIn("anonymous");
  }, [isLoading, isAuthenticated, signIn]);

  if (isAuthenticated) return <Navigate to="/dashboard" replace />;
  if (isLoading && !authTimedOut) return <RouteLoading />;
  return <Landing />;
}

/**
 * Fetches every page's code once the first screen is up.
 *
 * Without this, opening a tab meant waiting on a chunk request — and since the
 * Suspense boundary sits above the routes, that wait blanked the whole app.
 * Warming the modules while the browser is idle makes a tap a render, not a
 * download.
 */
function RoutePrefetcher() {
  const { isAuthenticated } = useConvexAuth();

  useEffect(() => {
    // Signed-out visitors get the two public pages warmed while idle. A signed
    // session goes straight to the dashboard, so its code is pulled at once —
    // waiting on the browser's idle time would show the heart during a chunk
    // request that could have been in flight already.
    // Signed-out visitors already have both public pages in the main bundle. A
    // signed session goes straight to the dashboard, so the rest is pulled at
    // once — waiting on the browser's idle time would show the heart during a
    // request that could have been in flight already.
    if (isAuthenticated) prefetchPages();
  }, [isAuthenticated]);

  return null;
}

function RouteSyncer() {
  const location = useLocation();
  useEffect(() => {
    window.parent.postMessage(
      { type: "iframe-route-change", path: location.pathname },
      "*",
    );
  }, [location.pathname]);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.data?.type === "navigate") {
        if (event.data.direction === "back") window.history.back();
        if (event.data.direction === "forward") window.history.forward();
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  return null;
}

/**
 * The whole app, built around the deployment the browser was told to use.
 *
 * It is a function of the client rather than a module-level singleton because
 * the deployment is verified before the first connection (see
 * lib/convexDeployment): a published build that was produced with a stale
 * address has to be able to fall back to one that answers.
 */
function App({ convex }: { convex: ConvexReactClient }) {
  return (
    <StrictMode>
      <RootErrorBoundary>
        {/* Every Framer animation in the app honours the system's motion
          preference from here — exit and layout transforms included. */}
        <MotionConfig reducedMotion="user">
          <ToolbarErrorBoundary>
            <VlyToolbar />
          </ToolbarErrorBoundary>
          <ConvexAuthProvider client={convex}>
            <BrowserRouter>
              <RouteSyncer />
              <RoutePrefetcher />
              <Suspense fallback={<RouteLoading />}>
                <Routes>
                  <Route path="/" element={<Home />} />
                  <Route
                    path="/auth"
                    element={<AuthPage redirectAfterAuth="/dashboard" />}
                  />
                  <Route
                    path="/dashboard"
                    element={
                      <RequireAuth>
                        <AppShell />
                      </RequireAuth>
                    }
                  >
                    <Route index element={<Dashboard />} />
                    <Route path="memories" element={<Memories />} />
                    <Route path="album" element={<Album />} />
                    <Route path="notes" element={<SharedNotes />} />
                    <Route path="settings" element={<Settings />} />
                  </Route>
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
              {/* Adults-only, asked once and remembered on this device. */}
              <AgeGate />
            </BrowserRouter>
            <Toaster />
          </ConvexAuthProvider>
        </MotionConfig>
      </RootErrorBoundary>
    </StrictMode>
  );
}

const root = createRoot(document.getElementById("root")!);

// Her heart is on screen from the very first frame, while the deployment check
// below is still in flight — never a blank page during boot.
root.render(
  <StrictMode>
    <MotionConfig reducedMotion="user">
      <RouteLoading />
    </MotionConfig>
  </StrictMode>,
);

void resolveConvexUrl().then((url) => {
  root.render(<App convex={new ConvexReactClient(url)} />);
});
