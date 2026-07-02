import { wordDiff } from "@/lib/diff";

export function DiffView({ oldText, newText }: { oldText: string; newText: string }) {
  const segments = wordDiff(oldText, newText);
  return (
    <p className="text-[13px] leading-relaxed text-ink-soft">
      {segments.map((seg, i) => {
        if (seg.type === "same") return <span key={i}>{seg.text}</span>;
        if (seg.type === "removed")
          return (
            <del key={i} className="rounded-sm bg-rose-50 px-0.5 text-rose-600 decoration-rose-300">
              {seg.text}
            </del>
          );
        return (
          <ins key={i} className="rounded-sm bg-emerald-50 px-0.5 text-emerald-700 no-underline">
            {seg.text}
          </ins>
        );
      })}
    </p>
  );
}
