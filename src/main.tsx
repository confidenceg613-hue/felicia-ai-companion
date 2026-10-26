import { useAuth } from "@/hooks/use-auth";
import Landing from "@/pages/Landing";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexReactClient } from "convex/react";
import { Heart } from "lucide-react";
import { motion, MotionConfig } from "framer-motion";
import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
} from "react-router";
import "./index.css";
import { resolveConvexUrl } from "@/lib/convexDeployment";
import { RequireAuth } from "@/components/RequireAuth";
import { pageModules, prefetchPages } from "@/lib/pageModules";
import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/sonner";
import AgeGate from "@/components/AgeGate";
import AuthPage from "@/pages/Auth";

const AppShell = lazy(pageModules.shell);
const Dashboard = lazy(pageModules.dashboard);
const Memories = lazy(pageModules.memories);
const Album = lazy(pageModules.album);
const SharedNotes = lazy(pageModules.notes);
const Settings = lazy(pageModules.settings);
const NotFound = lazy(pageModules.notFound);

function RouteLoading() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-7 bg-background">
      <div className="relative flex size-32 items-center justify-center">
        <motion.span
          aria-hidden
          className="absolute size-32 rounded-full bg-primary/30 blur-2xl"
          animate={{ scale: [1, 1.16, 1.02, 1.09, 1], opacity: [0.45, 0.9, 0.5, 0.8, 0.45] }}
          transition={{ duration: 1.5, times: [0, 0.12, 0.24, 0.36, 1], repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.span
          aria-hidden
          className="absolute size-24 rounded-full border border-primary/30"
          animate={{ scale: [1, 1.45, 1.05, 1.3, 1], opacity: [0.5, 0, 0.35, 0, 0.5] }}
          transition={{ duration: 1.5, times: [0, 0.12, 0.24, 0.36, 1], repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}>
          <motion.div animate={{ scale: [1, 1.16, 1.02, 1.09, 1] }} transition={{ duration: 1.5, times: [0, 0.12, 0.24, 0.36, 1], repeat: Infinity, ease: "easeInOut" }}>
            <Heart aria-hidden className="size-16 fill-primary text-primary" strokeWidth={1.25} />
          </motion.div>
        </motion.div>
      </div>
      <p className="font-display text-xs tracking-[0.42em] text-muted-foreground/80 uppercase">Felicia</p>
    </div>
  );
}

function Home() {
  const { isLoading, isAuthenticated } = useAuth();
  const [authTimedOut, setAuthTimedOut] = useState(false);

  useEffect(() => {
    if (!isLoading) return;
    const timer = setTimeout(() => setAuthTimedOut(true), 4000);
    return () => clearTimeout(timer);
  }, [isLoading]);

  if (isAuthenticated) return <Navigate to="/dashboard" replace />;
  if (isLoading && !authTimedOut) return <RouteLoading />;
  return <Landing />;
}

function RoutePrefetcher() {
  const { isAuthenticated } = useAuth();
  useEffect(() => {
    if (isAuthenticated) prefetchPages();
  }, [isAuthenticated]);
  return null;
}

function RouteSyncer() {
  const location = useLocation();
  useEffect(() => {
    window.parent.postMessage({ type: "iframe-route-change", path: location.pathname }, "*");
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

function App({ convex }: { convex: ConvexReactClient }) {
  return (
    <StrictMode>
      <MotionConfig reducedMotion="user">
        <ConvexAuthProvider client={convex}>
          <BrowserRouter>
            <RouteSyncer />
            <RoutePrefetcher />
            <Suspense fallback={<RouteLoading />}>
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/auth" element={<AuthPage redirectAfterAuth="/dashboard" />} />
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
            <AgeGate />
            <Toaster />
          </BrowserRouter>
        </ConvexAuthProvider>
      </MotionConfig>
    </StrictMode>
  );
}

const root = createRoot(document.getElementById("root")!);
root.render(
  <StrictMode>
    <MotionConfig reducedMotion="user">
      <RouteLoading />
    </MotionConfig>
  </StrictMode>,
);

void resolveConvexUrl()
  .then((url) => {
    root.render(<App convex={new ConvexReactClient(url)} />);
  })
  .catch((error) => {
    // A missing deployment address is a configuration problem, not a crash:
    // say so instead of leaving an unhandled rejection on a blank screen.
    console.error("Could not reach the Convex deployment:", error);
  });

