import { ImageIcon } from "lucide-react";
import { FELICIA_AVATAR_URL } from "@/lib/felicia";
import { cn } from "@/lib/utils";

export default function Face({ className }: { className?: string }) {
  return (
    <figure className={cn("overflow-hidden rounded-2xl border border-border/60 bg-card", className)}>
      <div className="overflow-hidden">
        <img
          src={FELICIA_AVATAR_URL}
          alt="Felicia"
          loading="lazy"
          className="aspect-square w-full object-cover transition-transform duration-700 hover:scale-105"
        />
      </div>
      <figcaption className="p-5">
        <p className="text-[11px] tracking-widest text-primary uppercase">
          Felicia Moreau
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          She is not a chatbot. She is Felicia.
        </p>
      </figcaption>
    </figure>
  );
}
