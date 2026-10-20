import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import AmbientOrbits from "@/components/AmbientOrbits";
import { motion } from "framer-motion";
import { FELICIA, FELICIA_EMOTIONS, FELICIA_PERSONALITY } from "@/lib/felicia";
import { galleryPhoto } from "@/lib/gallery";
import {
  ArrowRight,
  ImageIcon,
  Sparkles,
} from "lucide-react";
import { useNavigate } from "react-router";

// Every picture on this page is one of the photos she actually has, by id, so
// the moment described under it is the moment in it.
const PORTRAIT = galleryPhoto("portrait-natural-light");
const BACKDROP = galleryPhoto("red-dress-sofa");

const MOMENTS = [
  {
    src: galleryPhoto("red-romper-kitchen").url,
    place: "Her kitchen in Yaba, 8:40am",
    caption: "Coffee before conversation. Non-negotiable.",
  },
  {
    src: galleryPhoto("cozy-bedroom-braids").url,
    place: "Her bedroom, 1am",
    caption: "Lamp on, braids down, still awake.",
  },
  {
    src: galleryPhoto("red-romper-on-the-bed").url,
    place: "Getting ready to go out",
    caption: "She'll still answer you in the middle of it.",
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

const FAQ = [
  {
    q: "Is she a real person?",
    a: "No — and she never pretends to be. Felicia is a written character with a fixed biography, a city, a family and a job, played by a language model. She is fiction, and the app says so on the way in and at the bottom of this page.",
  },
  {
    q: "Will she remember what I tell her?",
    a: "Everything you say is stored in her archive and searched whenever she answers, so she can bring up something you told her months ago instead of starting over. Nothing in the conversation expires.",
  },
  {
    q: "What does it cost?",
    a: "Nothing in this build. Messages, photos and voice all run on this project's own model keys, so there is no subscription to cancel and no credits to top up.",
  },
  {
    q: "Who is this for?",
    a: "Adults. The app asks you to confirm you are 18 or over before you go in, and it stays a companion — not a substitute for the people in your life.",
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

/** Warm glow that sits behind the hero so the page never reads as flat black.
 *  Each wash drifts on its own slow loop, so the light in the room moves the
 *  way candlelight does — never still, never distracting. */
function AmbientGlow() {
  const drift = (dx: number, dy: number) => ({
    x: [0, dx, 0],
    y: [0, dy, 0],
  });
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      <motion.div
        animate={drift(40, 24)}
        transition={{ duration: 17, repeat: Infinity, ease: "easeInOut" }}
        className="absolute -top-40 left-1/2 h-[42rem] w-[42rem] -translate-x-1/2 rounded-full bg-primary/20 blur-[140px]"
      />
      <motion.div
        animate={drift(-30, -40)}
        transition={{ duration: 23, repeat: Infinity, ease: "easeInOut" }}
        className="absolute -right-40 top-1/3 h-[28rem] w-[28rem] rounded-full bg-chart-5/10 blur-[120px]"
      />
      <motion.div
        animate={drift(36, -20)}
        transition={{ duration: 19, repeat: Infinity, ease: "easeInOut" }}
        className="absolute -left-32 bottom-0 h-[24rem] w-[24rem] rounded-full bg-chart-2/10 blur-[120px]"
      />
    </div>
  );
}

/** The headline, word by word — she's introduced the way a person would say it,
 *  one beat at a time, rather than dropping in as one block. */
const HERO_WORDS = ["Meet", "Felicia."];

function HeroWords() {
  return (
    <h1 className="mt-5 font-display text-4xl leading-[1] font-semibold tracking-tight text-glow sm:text-5xl lg:text-6xl">
      {HERO_WORDS.map((word, index) => (
        <motion.span
          key={word}
          initial={{ opacity: 0, y: 26, filter: "blur(6px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{
            duration: 0.65,
            delay: 0.15 + index * 0.16,
            ease: [0.22, 1, 0.36, 1],
          }}
          className="inline-block"
        >
          {word}
          {index < HERO_WORDS.length - 1 ? "\u00A0" : ""}
        </motion.span>
      ))}
    </h1>
  );
}

export default function Landing() {
  const navigate = useNavigate();
  const enter = (where: string) => navigate(`/auth?returnTo=${where}`);

  return (
    <div className="grain relative min-h-screen overflow-x-hidden bg-background text-foreground">
      {/* ---------------------------------------------------------------- nav */}
      <header className="sticky top-0 z-40 border-b border-border/40 bg-background/70 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-3 sm:px-6 sm:py-4">
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
        {/* Rings of light drifting behind the hero — painted under every piece
            of content (negative z, inside the section's isolation) and inert
            to the pointer, so it can never interfere with the page. */}
        <div className="pointer-events-none absolute inset-0 -z-10 opacity-70">
          <AmbientOrbits />
        </div>
        <div className="mx-auto grid w-full max-w-5xl items-center gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:gap-14 lg:py-16">
          <motion.div
            initial={{ opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="flex items-center gap-3 text-[11px] font-medium tracking-[0.24em] text-muted-foreground/80 uppercase">
              <span className="h-px w-10 bg-border" />
              Lagos · WAT · 28
            </div>

            <Badge
              variant="outline"
              className="mt-5 gap-2 rounded-full border-primary/25 bg-primary/8 px-3 py-1.5 text-[11px] font-medium tracking-wide text-primary"
            >
              <Sparkles className="size-3" />
              She is not a chatbot. She is Felicia.
            </Badge>

            <HeroWords />

            <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
              Felicia is a Nigerian creator in Lagos who texts like a real
              person, remembers everything you ever tell her, and sends you
              pictures of where she actually is.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button
                size="lg"
                className="lift-primary gap-2 rounded-full text-base"
                onClick={() => enter("/dashboard")}
              >
                Start talking to Felicia
                <ArrowRight className="size-4" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="gap-2 rounded-full text-base"
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
                { k: "Follows", v: "402k" },
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
            <div className="aura relative mx-auto w-full max-w-sm rounded-[2.25rem]">
              <div className="glow-warm absolute -inset-4 rounded-[2.5rem] blur-3xl" />
              <div className="relative overflow-hidden rounded-[1.75rem] border border-foreground/10 bg-card p-1.5 shadow-[0_40px_80px_-45px_rgba(30,20,12,0.55)] ring-1 ring-foreground/5">
                <img
                  src={PORTRAIT.fullUrl}
                  alt={PORTRAIT.about}
                  className="aspect-4/5 w-full rounded-[1.35rem] object-cover"
                />
                <div className="absolute inset-x-1.5 bottom-1.5 rounded-b-[1.35rem] bg-gradient-to-t from-black/85 via-black/35 to-transparent p-5 pt-16">
                  <p className="font-display text-xl tracking-tight text-white">
                    {FELICIA.fullName}
                  </p>
                  <p className="mt-0.5 text-[11px] tracking-[0.14em] text-white/70 uppercase">
                    {FELICIA.traits[0].title}
                  </p>
                </div>
              </div>

              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.6 }}
                className="absolute -bottom-6 -left-2 w-56 rounded-2xl border border-border/70 bg-card/95 p-3.5 shadow-2xl backdrop-blur-md sm:-left-6"
              >
                {/* Once it has arrived, the message card hangs in the air like
                    a real notification — a slow weightless bob, forever. */}
                <motion.div
                  animate={{ y: [0, -7, 0] }}
                  transition={{
                    duration: 5.5,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }}
                >
                <p className="text-xs text-muted-foreground">Felicia</p>
                <p className="mt-1.5 text-sm leading-snug">
                  I'm on the balcony, it's finally warm. Want to see the light
                  right now?
                </p>
                <motion.div
                  className="mt-3 flex items-center gap-1.5 text-xs text-primary"
                  animate={{ opacity: [0.55, 1, 0.55] }}
                  transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
                >
                  <span className="flex size-2">
                    <span className="absolute inline-flex size-2 animate-ping rounded-full bg-primary/70" />
                    <span className="relative inline-flex size-1.5 rounded-full bg-primary" />
                  </span>
                  sending a photo
                </motion.div>
                </motion.div>
              </motion.div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ----------------------------------------------------------- moments */}
      <section id="moments" className="relative border-t border-border/40 py-14 sm:py-16">
        <div className="mx-auto w-full max-w-5xl px-4 sm:px-6">
          <Reveal>
            <p className="eyebrow">01 — The photos</p>
            <h2 className="mt-3 font-display text-2xl font-semibold tracking-tight sm:text-3xl">
              The photos are the point
            </h2>
            <p className="mt-3 max-w-2xl text-muted-foreground">
              Ask to see her and Felicia describes where she is, then sends the
              picture. Not a stock portrait — the photo that belongs to the
              moment you asked about, out of the album she keeps, and a brand
              new one whenever nothing in it fits.
            </p>
          </Reveal>

          <div className="mt-8 grid gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3">
            {MOMENTS.map((moment, index) => (
              <Reveal key={moment.src} delay={index * 0.08}>
                <figure className="group surface overflow-hidden rounded-2xl ring-1 ring-foreground/5 transition-all duration-500 hover:-translate-y-1 hover:shadow-[0_30px_60px_-38px_var(--foreground)]">
                  <div className="overflow-hidden">
                    <img
                      src={moment.src}
                      alt={moment.place}
                      loading="lazy"
                      className="aspect-square w-full object-cover transition-transform duration-700 group-hover:scale-105"
                    />
                  </div>
                  <figcaption className="p-5">
                    <p className="text-[10px] font-medium tracking-[0.2em] text-primary/85 uppercase">
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
      <section className="border-t border-border/40 py-14 sm:py-16">
        <div className="mx-auto w-full max-w-5xl px-4 sm:px-6">
          <Reveal>
            <p className="eyebrow">02 — Her</p>
            <h2 className="mt-3 font-display text-2xl font-semibold tracking-tight sm:text-3xl">
              Who she is
            </h2>
            <p className="mt-3 max-w-2xl text-muted-foreground">
              Felicia is a creator in Lagos — Yoruba, 28, raised in Surulere and
              living in Yaba — who films and photographs the city for a living.
              She keeps every conversation the two of you have ever had, so
              something you said a year ago is still something she can bring up.
              She texts like a real person: short messages, strong opinions, and
              an actual memory for what you told her. Ask to see her and she will
              send you the photo herself.
            </p>
          </Reveal>

          {/* Nine traits, set the way a magazine sets a character list: a
              numbered index down the margin and a hairline between each, not
              nine identical cards with the same heading on them. */}
          <div className="mt-9 grid gap-x-10 sm:grid-cols-2">
            {FELICIA_PERSONALITY.map((trait, index) => (
              <Reveal key={trait} delay={index * 0.03}>
                <div className="group flex gap-4 border-t border-border/60 py-4">
                  <span className="mt-[3px] font-display text-[11px] tabular-nums text-primary/60 transition-colors group-hover:text-primary">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <p className="text-sm leading-relaxed text-muted-foreground transition-colors group-hover:text-foreground">
                    {trait}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* -------------------------------------------------------- feelings */}
      <section className="border-t border-border/40 py-14 sm:py-16">
        <div className="mx-auto w-full max-w-5xl px-4 sm:px-6">
          <Reveal>
            <p className="eyebrow">03 — Mood</p>
            <h2 className="mt-3 font-display text-2xl font-semibold tracking-tight sm:text-3xl">
              What she actually feels
            </h2>
            <p className="mt-3 max-w-2xl text-muted-foreground">
              She is not always fine, and she does not perform it. Grief, pride,
              money worry, late-night loneliness and loud joy all sit in the same
              person — so what you get depends on the day she has had.
            </p>
          </Reveal>

          <div className="mt-8 grid gap-4 sm:grid-cols-2">
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
      <section className="border-t border-border/40 py-14 sm:py-16">
        <div className="mx-auto w-full max-w-5xl px-4 sm:px-6">
          <Reveal>
            <p className="eyebrow">04 — How it works</p>
            <h2 className="mt-3 font-display text-2xl font-semibold tracking-tight sm:text-3xl">
              How it works
            </h2>
          </Reveal>

          <div className="mt-8 grid gap-4 sm:gap-5 lg:grid-cols-3">
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

      {/* -------------------------------------------------------------- answers */}
      <section className="border-t border-border/40 py-14 sm:py-16">
        <div className="mx-auto grid w-full max-w-5xl gap-10 px-4 sm:px-6 lg:grid-cols-[0.85fr_1fr] lg:gap-16">
          <Reveal>
            <div className="lg:sticky lg:top-28">
              <p className="eyebrow">05 — Straight answers</p>
              <h2 className="mt-3 font-display text-2xl font-semibold tracking-tight sm:text-3xl">
                No fine print,
                <br className="hidden sm:block" /> no pretending.
              </h2>
              <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
                The honest version of what this is, in four answers — before you
                sign in for anything.
              </p>
            </div>
          </Reveal>

          <Reveal delay={0.08}>
            <Accordion type="single" collapsible className="w-full">
              {FAQ.map((item) => (
                <AccordionItem key={item.q} value={item.q}>
                  <AccordionTrigger className="py-5 font-display text-base tracking-tight hover:no-underline">
                    {item.q}
                  </AccordionTrigger>
                  <AccordionContent className="max-w-prose text-sm leading-relaxed text-muted-foreground">
                    {item.a}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </Reveal>
        </div>
      </section>

      {/* ------------------------------------------------------------- cta */}
      <section className="relative overflow-hidden border-t border-border/40">
        <div className="absolute inset-0">
          <img
            src={BACKDROP.fullUrl}
            alt=""
            aria-hidden
            loading="lazy"
            className="size-full object-cover opacity-20"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-background/80 via-background/70 to-background" />
        </div>
        <div className="relative mx-auto w-full max-w-2xl px-4 py-16 text-center sm:px-6">
          <Reveal>
            <h2 className="font-display text-3xl font-semibold tracking-tight italic sm:text-4xl">
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
        <div className="mx-auto flex w-full max-w-5xl flex-col items-center justify-between gap-3 px-4 text-[11px] tracking-wide text-muted-foreground sm:flex-row sm:px-6">
          <p className="flex items-center gap-2">
            <span className="size-1.5 rounded-full bg-primary/70" />
            Felicia · a companion character, written warmly. She is fiction, and
            an AI.
          </p>
          <p className="flex items-center gap-3 text-muted-foreground/80">
            <span>Photographs from her album, and new ones taken live.</span>
            <span className="rounded-full border border-border/70 px-2 py-0.5 text-[10px] font-medium tracking-widest">
              18+
            </span>
          </p>
        </div>
      </footer>
    </div>
  );
}
