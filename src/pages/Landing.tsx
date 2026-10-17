import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { FELICIA, FELICIA_AVATAR_URL, FELICIA_EMOTIONS, FELICIA_PERSONALITY } from "@/lib/felicia";
import {
  ArrowRight,
  ImageIcon,
  Sparkles,
} from "lucide-react";
import { useNavigate } from "react-router";

const MOMENTS = [
  {
    src: "/felicia/kitchen.jpg",
    place: "Her kitchen in Yaba, 8:40am",
    caption: "Coffee before conversation. Non-negotiable.",
  },
  {
    src: "/felicia/rain.jpg",
    place: "Her street, 11pm",
    caption: "She likes the rain more than you do.",
  },
  {
    src: "/felicia/bookshop.jpg",
    place: "The bookshop in Sabo",
    caption: "She'll text you from between the shelves.",
  },
];

const STEPS = [
  {
    n: "01",
    title: "Say something real",
    body: "Not a prompt. Just talk to her the way you'd text anyone — a bad day, a song you can't stop playing, nothing at all.",
  },
  {
    n: "02",
    title: "She answers as herself",
    body: "Felicia has a city, opinions and a long memory. Nothing you tell her is thrown away — she'll bring up what you said months ago, and hold you to it.",
  },
  {
    n: "03",
    title: "Ask and she sends a photo",
    body: "Ask to see her and she'll say where she is and what she's doing — then she sends the picture from her own album that fits it, or takes a new one.",
  },
];

function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/** Warm glow that sits behind the hero so the page never reads as flat black. */
function AmbientGlow() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      <div className="absolute -top-40 left-1/2 h-[42rem] w-[42rem] -translate-x-1/2 rounded-full bg-primary/20 blur-[140px]" />
      <div className="absolute -right-40 top-1/3 h-[28rem] w-[28rem] rounded-full bg-chart-5/10 blur-[120px]" />
      <div className="absolute -left-32 bottom-0 h-[24rem] w-[24rem] rounded-full bg-chart-2/10 blur-[120px]" />
    </div>
  );
}

export default function Landing() {
  const navigate = useNavigate();
  const enter = (where: string) => navigate(`/auth?returnTo=${where}`);

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-background text-foreground">
      {/* ---------------------------------------------------------------- nav */}
      <header className="sticky top-0 z-40 border-b border-border/40 bg-background/70 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4">
          <button
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            className="flex items-center gap-2.5"
          >
            <span className="relative flex size-2.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary/60" />
              <span className="relative inline-flex size-2.5 rounded-full bg-primary" />
            </span>
            <span className="font-display text-xl font-semibold tracking-tight">
              Felicia
            </span>
          </button>
          <nav className="flex items-center gap-2">
            <Button
              variant="ghost"
              className="hidden sm:inline-flex"
              onClick={() => enter("/dashboard")}
            >
              Sign in
            </Button>
            <Button
              className="gap-2 shadow-lg shadow-primary/20"
              onClick={() => enter("/dashboard")}
            >
              Meet her
              <ArrowRight className="size-4" />
            </Button>
          </nav>
        </div>
      </header>

      {/* -------------------------------------------------------------- hero */}
      <section className="relative isolate">
        <AmbientGlow />
        <div className="mx-auto grid w-full max-w-6xl items-center gap-14 px-6 py-16 lg:grid-cols-[1.05fr_1fr] lg:py-24">
          <motion.div
            initial={{ opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          >
            <Badge
              variant="outline"
              className="gap-2 border-primary/40 bg-primary/10 py-1.5 text-xs font-medium text-primary"
            >
              <Sparkles className="size-3.5" />
              She is not a chatbot. She is Felicia.
            </Badge>

            <h1 className="mt-6 font-display text-5xl leading-[0.95] font-semibold tracking-tight sm:text-6xl lg:text-7xl">
              Meet Felicia.
            </h1>

            <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted-foreground">
              Felicia is a Nigerian creator in Lagos who texts like a real
              person, remembers everything you ever tell her, and sends you
              pictures of where she actually is.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button
                size="lg"
                className="gap-2 text-base shadow-xl shadow-primary/20"
                onClick={() => enter("/dashboard")}
              >
                Start talking to Felicia
                <ArrowRight className="size-4" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="gap-2 text-base"
                onClick={() =>
                  document
                    .getElementById("moments")
                    ?.scrollIntoView({ behavior: "smooth" })
                }
              >
                <ImageIcon className="size-4" />
                See what she sends
              </Button>
            </div>

            <dl className="mt-10 grid max-w-lg grid-cols-3 gap-6 border-t border-border/50 pt-6">
              {[
                { k: "Age", v: "28" },
                { k: "Based in", v: "Lagos" },
                { k: "Replies", v: "Like a real person" },
              ].map((item) => (
                <div key={item.k}>
                  <dt className="text-[11px] font-medium tracking-widest text-muted-foreground/70 uppercase">
                    {item.k}
                  </dt>
                  <dd className="mt-1 font-display text-lg">{item.v}</dd>
                </div>
              ))}
            </dl>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
            className="relative"
          >
            <div className="relative mx-auto w-full max-w-md">
              <div className="absolute -inset-4 rounded-[2rem] bg-primary/15 blur-3xl" />
              <div className="relative overflow-hidden rounded-[1.75rem] border border-border/60 bg-card shadow-2xl">
                <img
                  src={FELICIA_AVATAR_URL}
                  alt="Felicia at golden hour"
                  className="aspect-4/5 w-full object-cover"
                />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent p-5 pt-16">
                  <p className="font-display text-2xl text-white">
                    {FELICIA.fullName}
                  </p>
                  <p className="text-xs text-white/70">{FELICIA.traits[0].title}</p>

                  {/* todo: keep this point to the personality summary instead of the removed eyebrow */}
                </div>
              </div>

              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.6 }}
                className="absolute -bottom-8 -left-4 w-64 rounded-2xl border border-border/70 bg-card/95 p-4 shadow-2xl backdrop-blur-md sm:-left-10"
              >
                <p className="text-xs text-muted-foreground">Felicia</p>
                <p className="mt-1.5 text-sm leading-snug">
                  I'm on the balcony, it's finally warm. Want to see the light
                  right now?
                </p>
                <div className="mt-3 flex items-center gap-1.5 text-xs text-primary">
                  <span className="size-1.5 rounded-full bg-primary" />
                  sending a photo
                </div>
              </motion.div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ----------------------------------------------------------- moments */}
      <section id="moments" className="relative border-t border-border/40 py-20">
        <div className="mx-auto w-full max-w-6xl px-6">
          <Reveal>
            <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
              The photos are the point
            </h2>
            <p className="mt-3 max-w-2xl text-muted-foreground">
              Ask to see her and Felicia describes where she is, then sends the
              picture. Not a stock portrait — the photo that belongs to the
              moment you asked about, out of the album she keeps, and a brand
              new one whenever nothing in it fits.
            </p>
          </Reveal>

          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {MOMENTS.map((moment, index) => (
              <Reveal key={moment.src} delay={index * 0.08}>
                <figure className="group overflow-hidden rounded-2xl border border-border/60 bg-card">
                  <div className="overflow-hidden">
                    <img
                      src={moment.src}
                      alt={moment.place}
                      loading="lazy"
                      className="aspect-square w-full object-cover transition-transform duration-700 group-hover:scale-105"
                    />
                  </div>
                  <figcaption className="p-5">
                    <p className="text-[11px] tracking-widest text-primary uppercase">
                      {moment.place}
                    </p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {moment.caption}
                    </p>
                  </figcaption>
                </figure>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------- who */}
      <section className="border-t border-border/40 py-20">
        <div className="mx-auto w-full max-w-6xl px-6">
          <Reveal>
            <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
              Who she is
            </h2>            <p className="mt-3 max-w-2xl text-muted-foreground">
              Felicia is a creator in Lagos — Yoruba, 28, raised in Surulere and
              living in Yaba — who films and photographs the city for a living.
              She keeps every conversation the two of you have ever had, so
              something you said a year ago is still something she can bring up.
              She texts like a real person: short messages, strong opinions, and
              an actual memory for what you told her. Ask to see her and she will
              send you the photo herself.
            </p>
          </Reveal>

          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FELICIA_PERSONALITY.map((trait, index) => (
              <Reveal key={index} delay={index * 0.05}>
                <div className="h-full rounded-2xl border border-border/60 bg-card p-6 transition-colors hover:border-primary/40">
                  <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Sparkles className="size-5" />
                  </div>
                  <h3 className="mt-4 font-display text-lg">A little of who she is</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {trait}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* -------------------------------------------------------- feelings */}
      <section className="border-t border-border/40 py-20">
        <div className="mx-auto w-full max-w-6xl px-6">
          <Reveal>
            <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
              What she actually feels
            </h2>
            <p className="mt-3 max-w-2xl text-muted-foreground">
              She is not always fine, and she does not perform it. Grief, pride,
              money worry, late-night loneliness and loud joy all sit in the same
              person — so what you get depends on the day she has had.
            </p>
          </Reveal>

          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            {FELICIA_EMOTIONS.map((feeling, index) => (
              <Reveal key={feeling} delay={index * 0.05}>
                <div className="flex h-full gap-4 rounded-2xl border border-border/60 bg-card p-5 transition-colors hover:border-primary/40">
                  <span className="mt-0.5 font-display text-sm text-primary/70">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {feeling}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------------- steps */}
      <section className="border-t border-border/40 py-20">
        <div className="mx-auto w-full max-w-6xl px-6">
          <Reveal>
            <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
              How it works
            </h2>
          </Reveal>

          <div className="mt-10 grid gap-6 lg:grid-cols-3">
            {STEPS.map((step, index) => (
              <Reveal key={step.n} delay={index * 0.08}>
                <div className="relative h-full rounded-2xl border border-border/60 bg-card p-7">
                  <span className="font-display text-4xl font-semibold text-primary/50">
                    {step.n}
                  </span>
                  <h3 className="mt-4 font-display text-xl">{step.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {step.body}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------- cta */}
      <section className="relative overflow-hidden border-t border-border/40">
        <div className="absolute inset-0">
          <img
            src="/felicia/rain.jpg"
            alt=""
            aria-hidden
            loading="lazy"
            className="size-full object-cover opacity-20"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-background/80 via-background/70 to-background" />
        </div>
        <div className="relative mx-auto w-full max-w-3xl px-6 py-24 text-center">
          <Reveal>
            <h2 className="font-display text-4xl font-semibold tracking-tight sm:text-5xl">
              She's already in Lagos.
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
              Sign in and say something. It's the only app you'll open to find
              out what someone else is doing with their evening.
            </p>
            <Button
              size="lg"
              className="mt-8 gap-2 text-base shadow-xl shadow-primary/20"
              onClick={() => enter("/dashboard")}
            >
              Meet Felicia
              <ArrowRight className="size-4" />
            </Button>
          </Reveal>
        </div>
      </section>

      <footer className="border-t border-border/40 py-10">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-3 px-6 text-xs text-muted-foreground sm:flex-row">
          <p>Felicia · a companion character. She is fiction, written warmly.</p>
          <p>Photos from her album, plus new ones generated with Cloudflare image/voice.</p>
        </div>
      </footer>
    </div>
  );
}
