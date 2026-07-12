import { wordDiff } from "@/lib/diff";

// Editorial redline: a blue-pencil insertion, a red-pencil strikethrough —
// the copy-editor's mark-up idiom, not a code diff. Runs in the serif
// "claim" face since what's being marked up is always the hypothesis
// statement itself. Colors come from --color-diff-add/-remove, kept
// deliberately separate from the band/stance scales (see globals.css).
export function DiffView({ oldText, newText }: { oldText: string; newText: string }) {
  const segments = wordDiff(oldText, newText);
  return (
    <p className="font-serif text-[14px] italic leading-relaxed text-ink-soft">
      {segments.map((seg, i) => {
        if (seg.type === "same") return <span key={i}>{seg.text}</span>;
        if (seg.type === "removed")
          return (
            <del key={i} className="rounded-sm bg-diff-remove/10 px-0.5 text-diff-remove decoration-diff-remove/50">
              {seg.text}
            </del>
          );
        return (
          <ins key={i} className="rounded-sm bg-diff-add/10 px-0.5 text-diff-add no-underline">
            {seg.text}
          </ins>
        );
      })}
    </p>
  );
}
