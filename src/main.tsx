import '@vly-ai/integrations';
import { Toaster } from "@/components/ui/sonner";
import { RequireAuth } from "@/components/RequireAuth";
import { useAuth } from "@/hooks/use-auth";
import AgeGate from "@/components/AgeGate";
import { VlyToolbar } from "../vly-toolbar-readonly.tsx";
import { pageModules, prefetchPages } from "@/lib/pageModules";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexReactClient, useConvexAuth } from "convex/react";
import { Heart } from "lucide-react";
import { MotionConfig, motion } from "framer-motion";
import React, { StrictMode, useEffect, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
} from "react-router";
import "./index.css";

// Lazy load route components for better code splitting. The modules come from
// one shared map so the prefetcher below warms exactly what the router needs.
const Landing = lazy(pageModules.landing);
const AuthPage = lazy(pageModules.auth);
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
          animate={{ scale: [1, 1.45, 1.05, 1.3, 1], opacity: [0.5, 0, 0.35, 0, 0.5] }}
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

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL as string);

/**
 * The app's front door.
 *
 * "Meet Felicia" is for visitors who are not signed in. Once there is a
 * session, opening the app goes straight into the chat — the landing page
 * would only ever be a screen to click past on the way to the conversation.
 * Signing out ends the session, so the landing page comes back on its own.
 */
function Home() {
  const { isLoading, isAuthenticated } = useAuth();
  if (isLoading) return <RouteLoading />;
  if (isAuthenticated) return <Navigate to="/dashboard" replace />;
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
    // Signed out, only the two public pages are worth pulling; once there is a
    // session, every tab is warmed so none of them is the one that waits.
    const warm = () => {
      if (isAuthenticated) {
        prefetchPages();
        return;
      }
      void pageModules.landing();
      void pageModules.auth();
    };

    const scope = window as Window & {
      requestIdleCallback?: (
        callback: () => void,
        options?: { timeout: number },
      ) => number;
      cancelIdleCallback?: (handle: number) => void;
    };

    if (scope.requestIdleCallback) {
      const handle = scope.requestIdleCallback(warm, { timeout: 1500 });
      return () => scope.cancelIdleCallback?.(handle);
    }

    const timer = setTimeout(warm, 250);
    return () => clearTimeout(timer);
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


createRoot(document.getElementById("root")!).render(
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
  </StrictMode>,
);
