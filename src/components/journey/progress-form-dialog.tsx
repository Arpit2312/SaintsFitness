"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useGuardedDialogOpenChange } from "@/hooks/use-guarded-dialog";
import { saveJourneyProgress } from "@/actions/journey";
import { DANCE_LEVELS } from "@/lib/journey/qualities";
import type { JourneyProgressValues } from "@/lib/journey/types";
import { toast } from "sonner";

const NONE = "none";
const NONE_LABEL = "Not yet reflected";
const SCORE_OPTIONS = Array.from({ length: 10 }, (_, i) => String(i + 1));

const SCORE_FIELDS = [
  { key: "fitnessScore", label: "Fitness" },
  { key: "consistencyScore", label: "Consistency" },
  { key: "awarenessScore", label: "Awareness" },
  { key: "growthScore", label: "Self Growth" },
] as const;
type ScoreKey = (typeof SCORE_FIELDS)[number]["key"];

type FormState = { danceLevel: string } & Record<ScoreKey, string>;

function scoreToState(score: number | null | undefined): string {
  return score == null ? NONE : String(score);
}

function toFormState(initial: JourneyProgressValues | null): FormState {
  return {
    danceLevel: initial?.danceLevel ?? NONE,
    fitnessScore: scoreToState(initial?.fitnessScore),
    consistencyScore: scoreToState(initial?.consistencyScore),
    awarenessScore: scoreToState(initial?.awarenessScore),
    growthScore: scoreToState(initial?.growthScore),
  };
}

const stateToScore = (value: string): number | null => (value === NONE ? null : Number(value));

function ChoiceSelect({
  id,
  value,
  onChange,
  options,
  formatOption,
  disabled,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly string[];
  formatOption: (option: string) => string;
  disabled: boolean;
}) {
  return (
    <Select
      value={value}
      disabled={disabled}
      // base-ui types onValueChange's value as `string | null`, but no real
      // call site emits null in single-select mode -- see batch-form-dialog.tsx.
      onValueChange={(v) => onChange(v as string)}
    >
      <SelectTrigger id={id} className="w-full">
        <SelectValue placeholder={NONE_LABEL}>
          {(v: string) => (v === NONE ? NONE_LABEL : formatOption(v))}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>{NONE_LABEL}</SelectItem>
        {options.map((option) => (
          <SelectItem key={option} value={option}>
            {formatOption(option)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function ProgressFormDialog({
  open,
  onOpenChange,
  studentId,
  initial,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentId: string;
  initial: JourneyProgressValues | null;
  onSuccess?: () => void;
}) {
  const [form, setForm] = useState<FormState>(() => toFormState(initial));
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await saveJourneyProgress(studentId, {
        danceLevel: form.danceLevel === NONE ? null : form.danceLevel,
        fitnessScore: stateToScore(form.fitnessScore),
        consistencyScore: stateToScore(form.consistencyScore),
        awarenessScore: stateToScore(form.awarenessScore),
        growthScore: stateToScore(form.growthScore),
      });
      toast.success("Progress updated");
      onOpenChange(false);
      onSuccess?.();
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const handleOpenChange = useGuardedDialogOpenChange(submitting, onOpenChange);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent showCloseButton={!submitting}>
        <DialogHeader>
          <DialogTitle>Update progress</DialogTitle>
          <DialogDescription>
            Reflect only what you have observed. Anything left as &ldquo;{NONE_LABEL}&rdquo; stays quietly unrated.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="danceLevel">Dance level</Label>
            <ChoiceSelect
              id="danceLevel"
              value={form.danceLevel}
              onChange={(v) => setForm((f) => ({ ...f, danceLevel: v }))}
              options={DANCE_LEVELS}
              formatOption={(o) => o}
              disabled={submitting}
            />
          </div>
          {SCORE_FIELDS.map(({ key, label }) => (
            <div key={key} className="space-y-2">
              <Label htmlFor={key}>{label}</Label>
              <ChoiceSelect
                id={key}
                value={form[key]}
                onChange={(v) => setForm((f) => ({ ...f, [key]: v }))}
                options={SCORE_OPTIONS}
                formatOption={(o) => `${o} / 10`}
                disabled={submitting}
              />
            </div>
          ))}
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? "Saving..." : "Save progress"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
