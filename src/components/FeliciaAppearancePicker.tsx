import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  FELICIA_OUTFITS,
  FELICIA_BACKGROUNDS,
  FELICIA_APPEARANCE_DEFAULT,
  type FeliciaAppearance,
} from "@/lib/felicia";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { useState } from "react";

const PRESET_SCENES = [
  {
    label: "Surprise me",
    scene:
      "somewhere she has just arrived, warm evening light, candid",
  },
  {
    label: "Golden hour selfie",
    scene:
      "a candid selfie, holding the camera at arm's length, soft window light, natural smile",
  },
  {
    label: "At the cafe",
    scene:
      "behind the counter of Cafe Nove, hair tied up, laughing at something off camera",
  },
  {
    label: "Rainy evening",
    scene:
      "in front of a rain-streaked window, warm lamp light, quiet evening",
  },
  {
    label: "Out late",
    scene:
      "on a city street at night under warm streetlights, soft bokeh lights behind her, cinematic",
  },
  {
    label: "Reading at home",
    scene:
      "curled up in an armchair with a paperback, warm lamp light, quiet evening at home",
  },
];

type PickerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: FeliciaAppearance;
  onChange: (next: FeliciaAppearance) => void;
};

export default function FeliciaAppearancePicker({
  open,
  onOpenChange,
  value,
  onChange,
}: PickerProps) {
  const [customScene, setCustomScene] = useState(
    value.overrideScene ?? "",
  );

  function commit() {
    onChange({
      ...value,
      overrideScene: customScene.trim() || null,
    });
  }

  function pickPreset(preset: (typeof PRESET_SCENES)[number]) {
    onChange({
      ...FELICIA_APPEARANCE_DEFAULT,
      overrideScene: preset.scene,
    });
    setCustomScene(preset.scene);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl border-border/60 bg-card">
        <DialogHeader>
          <DialogTitle className="font-display text-xl flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Sparkles className="size-4" />
            </span>
            How Felicia looks
          </DialogTitle>
          <DialogDescription>
            Pick an outfit and a background. Mix and match — any combination is
            fine.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-3 space-y-4">
          {/* Outfit */}
          <div>
            <div className="mb-2 flex items-baseline justify-between">
              <Label className="font-display text-base">Outfit</Label>
              <span className="text-[11px] text-muted-foreground/70">
                The clothes — her face and figure stay the same.
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {FELICIA_OUTFITS.map((outfit) => (
                <button
                  key={outfit.key}
                  type="button"
                  onClick={() => {
                    onChange({ ...value, outfitKey: outfit.key });
                    commit();
                  }}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs transition-colors",
                    value.outfitKey === outfit.key
                      ? "border-primary/60 bg-primary/10 text-foreground"
                      : "border-border/60 bg-background/40 text-muted-foreground hover:border-primary/50 hover:text-foreground",
                  )}
                >
                  {outfit.label}
                </button>
              ))}
            </div>
          </div>

          {/* Background */}
          <div>
            <div className="mb-2 flex items-baseline justify-between">
              <Label className="font-display text-base">Background</Label>
              <span className="text-[11px] text-muted-foreground/70">
                Where the photo is taken.
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {FELICIA_BACKGROUNDS.map((bg) => (
                <button
                  key={bg.key}
                  type="button"
                  onClick={() => {
                    onChange({ ...value, backgroundKey: bg.key });
                    commit();
                  }}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs transition-colors",
                    value.backgroundKey === bg.key
                      ? "border-primary/60 bg-primary/10 text-foreground"
                      : "border-border/60 bg-background/40 text-muted-foreground hover:border-primary/50 hover:text-foreground",
                  )}
                >
                  {bg.label}
                </button>
              ))}
            </div>
          </div>

          <Separator />

          {/* Custom scene */}
          <div>
            <Label className="font-display text-base">Custom scene</Label>
            <p className="mt-1 text-xs text-muted-foreground">
              Optional. If you write one, it replaces the outfit + background
              combo and is used exactly as written.
            </p>
            <div className="mt-2">
              <Textarea
                value={customScene}
                onChange={(event) => setCustomScene(event.target.value)}
                placeholder="Describe the photo in your own words — where she is, what she's wearing, the mood and the light."
                rows={2}
              />
            </div>
          </div>

          <Separator />

          {/* Quick presets */}
          <div>
            <p className="mb-2 text-xs text-muted-foreground">
              Or pick a ready-made scene — Felicia will tell you where she is
              first, then send the photo.
            </p>
            <div className="flex flex-wrap gap-2">
              {PRESET_SCENES.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => pickPreset(preset)}
                  className="rounded-full border border-border/60 bg-background/40 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-2 border-t border-border/50 pt-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              onChange(FELICIA_APPEARANCE_DEFAULT);
              setCustomScene("");
              commit();
            }}
          >
            Reset
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
