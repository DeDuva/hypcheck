import Link from "next/link";
import { deleteHypcheckAction, updateSettingsAction } from "@/lib/actions";
import { CADENCE_LABELS, DEPTH_LABELS, type Cadence, type Depth } from "@/lib/types";
import { requireHypcheckAccess } from "@/lib/authz";

export const dynamic = "force-dynamic";

const CADENCES: Cadence[] = ["daily", "weekly", "biweekly", "monthly"];
const DEPTHS: Depth[] = ["brief", "standard", "deep"];

export default async function SettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { hypcheck, role } = await requireHypcheckAccess(id, "editor");
  const canDelete = role === "owner" || role === "admin";

  return (
    <div className="mx-auto max-w-2xl px-6 py-10 lg:px-8">
      <div className="flex items-center gap-2 text-[12px] text-ink-faint">
        <Link href="/" className="transition-colors hover:text-ink">
          Dashboard
        </Link>
        <span aria-hidden>/</span>
        <Link href={`/hypcheck/${id}`} className="transition-colors hover:text-ink">
          {hypcheck.name}
        </Link>
        <span aria-hidden>/</span>
        <span className="text-ink-soft">Settings</span>
      </div>

      <h1 className="mt-2 text-[22px] font-semibold tracking-tight">Settings</h1>

      <form action={updateSettingsAction.bind(null, id)} className="mt-6 space-y-5 rounded-2xl border border-edge bg-surface p-6 shadow-card">
        <div>
          <label htmlFor="name" className="text-[12.5px] font-semibold text-ink">
            Name
          </label>
          <input
            id="name"
            name="name"
            defaultValue={hypcheck.name}
            required
            className="mt-1.5 w-full rounded-lg border border-edge bg-paper/50 px-3 py-2 text-[13.5px] outline-none transition-colors focus:border-iris focus:bg-surface"
          />
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="cadence" className="text-[12.5px] font-semibold text-ink">
              Run cadence
            </label>
            <select
              id="cadence"
              name="cadence"
              defaultValue={hypcheck.cadence}
              className="mt-1.5 w-full rounded-lg border border-edge bg-paper/50 px-3 py-2 text-[13.5px] outline-none transition-colors focus:border-iris focus:bg-surface"
            >
              {CADENCES.map((c) => (
                <option key={c} value={c}>
                  {CADENCE_LABELS[c]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="depth" className="text-[12.5px] font-semibold text-ink">
              Research depth
            </label>
            <select
              id="depth"
              name="depth"
              defaultValue={hypcheck.depth}
              className="mt-1.5 w-full rounded-lg border border-edge bg-paper/50 px-3 py-2 text-[13.5px] outline-none transition-colors focus:border-iris focus:bg-surface"
            >
              {DEPTHS.map((d) => (
                <option key={d} value={d}>
                  {DEPTH_LABELS[d]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label htmlFor="watchlist" className="text-[12.5px] font-semibold text-ink">
            Watchlist
          </label>
          <p className="mt-0.5 text-[12px] text-ink-faint">
            Companies, products, or competitive signals to check each run — comma separated.
          </p>
          <input
            id="watchlist"
            name="watchlist"
            defaultValue={hypcheck.watchlist.join(", ")}
            placeholder="e.g. Gong, Clari, Salesforce Einstein Copilot"
            className="mt-1.5 w-full rounded-lg border border-edge bg-paper/50 px-3 py-2 text-[13.5px] outline-none transition-colors focus:border-iris focus:bg-surface"
          />
        </div>

        <div>
          <label htmlFor="status" className="text-[12.5px] font-semibold text-ink">
            Status
          </label>
          <select
            id="status"
            name="status"
            defaultValue={hypcheck.status}
            className="mt-1.5 w-full rounded-lg border border-edge bg-paper/50 px-3 py-2 text-[13.5px] outline-none transition-colors focus:border-iris focus:bg-surface"
          >
            <option value="active">Active — runs on schedule</option>
            <option value="paused">Paused — no scheduled runs</option>
          </select>
        </div>

        <div className="flex items-center justify-between border-t border-edge pt-4">
          <Link href={`/hypcheck/${id}`} className="text-[13px] font-medium text-ink-faint transition-colors hover:text-ink">
            Cancel
          </Link>
          <button
            type="submit"
            className="rounded-lg bg-iris px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-iris-deep"
          >
            Save settings
          </button>
        </div>
      </form>

      {canDelete && (
        <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50/40 p-5">
          <h2 className="text-[13.5px] font-semibold text-rose-800">Danger zone</h2>
          <p className="mt-1 text-[12.5px] text-rose-700/80">
            Deletes this hypcheck with its full run history, reports, and insights. This cannot be undone.
          </p>
          <form action={deleteHypcheckAction.bind(null, id)} className="mt-3">
            <button
              type="submit"
              className="rounded-lg bg-surface px-3.5 py-2 text-[12.5px] font-medium text-rose-700 ring-1 ring-inset ring-rose-200 transition-colors hover:bg-rose-50"
            >
              Delete hypcheck
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
