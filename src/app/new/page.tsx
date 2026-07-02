import { Wizard } from "@/components/Wizard";

export default function NewHypcheckPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-10 lg:px-8">
      <h1 className="text-[22px] font-semibold tracking-tight">New hypcheck</h1>
      <p className="mt-1 max-w-xl text-[13.5px] leading-relaxed text-ink-soft">
        Define the hypothesis, choose the signals that would prove (or disprove) it, and set the research cadence.
        Hypcheck runs the market test on schedule and tracks the PMF score over time.
      </p>
      <div className="mt-7">
        <Wizard />
      </div>
    </div>
  );
}
