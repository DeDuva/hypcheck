import Link from "next/link";
import {
  deleteHypcheckAction,
  grantHypcheckAccessAction,
  revokeHypcheckAccessAction,
  revokeInvitationAction,
  updateAccessRoleAction,
  updateSettingsAction,
} from "@/lib/actions";
import { CADENCE_LABELS, DEPTH_LABELS, type Cadence, type Depth } from "@/lib/types";
import { requireHypcheckAccess } from "@/lib/authz";
import { getUserById, listAccessGrantsWithUsers, listInvitations } from "@/lib/store";
import { WatchlistEditor } from "@/components/WatchlistEditor";

export const dynamic = "force-dynamic";

const CADENCES: Cadence[] = ["daily", "weekly", "biweekly", "monthly"];
const DEPTHS: Depth[] = ["brief", "standard", "deep"];

export default async function SettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ shareError?: string }>;
}) {
  const { id } = await params;
  const { shareError } = await searchParams;
  const { hypcheck, role } = await requireHypcheckAccess(id, "editor");
  const canDelete = role === "owner" || role === "admin";
  const canGrantEditor = role === "owner" || role === "admin";
  const grants = await listAccessGrantsWithUsers(id);
  const invitations = await listInvitations(id);
  const owner = hypcheck.ownerId ? await getUserById(hypcheck.ownerId) : null;

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

        <WatchlistEditor initial={hypcheck.watchlist} />

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

      {hypcheck.refinement && (
        <div className="mt-5 rounded-2xl border border-edge bg-surface p-6 shadow-card">
          <h2 className="text-[15px] font-semibold text-ink">Refinement notes</h2>
          <p className="mt-1 text-[12.5px] text-ink-faint">
            The AI advisor&apos;s critique from when this hypothesis was authored — the standing definition of what
            testing it means.
          </p>
          <p className="mt-3 text-[13px] leading-relaxed text-ink-soft">{hypcheck.refinement.critique}</p>
          {hypcheck.refinement.rubric.length > 0 && (
            <ul className="mt-3.5 space-y-1.5 border-t border-edge pt-3.5">
              {hypcheck.refinement.rubric.map((check) => (
                <li key={check.criterion} className="flex items-start gap-2 text-[12.5px]">
                  <span className={check.pass ? "text-emerald-600" : "text-amber-600"} aria-hidden>
                    {check.pass ? "✓" : "✗"}
                  </span>
                  <span>
                    <span className="font-medium text-ink">{check.criterion}</span>
                    {!check.pass && check.fix && <span className="text-ink-faint"> — {check.fix}</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="mt-5 rounded-2xl border border-edge bg-surface p-6 shadow-card">
        <h2 className="text-[15px] font-semibold text-ink">Sharing</h2>
        <p className="mt-1 text-[12.5px] text-ink-faint">
          {owner ? (
            <>
              Owned by {owner.name} ({owner.email}).{" "}
            </>
          ) : (
            "Owned by no one in particular — grandfathered in as shared. "
          )}
          Invite anyone by email — if they haven&apos;t signed in yet, access activates automatically the first time they do.
        </p>

        {(grants.length > 0 || invitations.length > 0) && (
          <ul className="mt-4 divide-y divide-edge border-t border-edge">
            {grants.map((grant) => (
              <li key={grant.id} className="flex items-center justify-between py-2.5">
                <div>
                  <p className="text-[13px] font-medium text-ink">{grant.name}</p>
                  <p className="text-[12px] text-ink-faint">{grant.email}</p>
                </div>
                <div className="flex items-center gap-2.5">
                  {canGrantEditor ? (
                    <form action={updateAccessRoleAction.bind(null, id, grant.userId)} className="flex items-center gap-1.5">
                      <select
                        name="role"
                        defaultValue={grant.role}
                        className="rounded-md border border-edge bg-paper/50 px-2 py-1 text-[12px] font-medium text-ink-soft outline-none transition-colors focus:border-iris focus:bg-surface"
                      >
                        <option value="viewer">Viewer</option>
                        <option value="editor">Editor</option>
                      </select>
                      <button
                        type="submit"
                        className="rounded-md px-2.5 py-1 text-[12px] font-medium text-ink-soft ring-1 ring-inset ring-edge transition-colors hover:bg-paper hover:text-ink"
                      >
                        Update
                      </button>
                    </form>
                  ) : (
                    // Only the owner/admin can grant editor, so a plain editor
                    // has no real role choice to offer here (it'd always be
                    // "viewer", a silent no-op) — show the role read-only
                    // instead of a select that can't actually change anything.
                    <span className="rounded-full bg-paper px-2.5 py-0.5 text-[11.5px] font-medium capitalize text-ink-soft ring-1 ring-inset ring-edge">
                      {grant.role}
                    </span>
                  )}
                  {(canGrantEditor || grant.role === "viewer") && (
                    <form action={revokeHypcheckAccessAction.bind(null, id, grant.userId)}>
                      <button
                        type="submit"
                        className="rounded-md px-2.5 py-1 text-[12px] font-medium text-rose-600/80 transition-colors hover:bg-rose-50 hover:text-rose-700"
                      >
                        Remove
                      </button>
                    </form>
                  )}
                </div>
              </li>
            ))}
            {invitations.map((invite) => (
              <li key={invite.id} className="flex items-center justify-between py-2.5">
                <div>
                  <p className="text-[13px] font-medium text-ink">{invite.email}</p>
                  <p className="text-[12px] text-ink-faint">Invited — activates on first sign-in</p>
                </div>
                <div className="flex items-center gap-2.5">
                  <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-[11.5px] font-medium capitalize text-amber-700 ring-1 ring-inset ring-amber-200">
                    {invite.role}
                  </span>
                  <form action={revokeInvitationAction.bind(null, id, invite.email)}>
                    <button
                      type="submit"
                      className="rounded-md px-2.5 py-1 text-[12px] font-medium text-rose-600/80 transition-colors hover:bg-rose-50 hover:text-rose-700"
                    >
                      Cancel invite
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}

        <form action={grantHypcheckAccessAction.bind(null, id)} className="mt-4 flex items-end gap-2 border-t border-edge pt-4">
          <div className="flex-1">
            <label htmlFor="share-email" className="text-[12.5px] font-semibold text-ink">
              Invite by email
            </label>
            <input
              id="share-email"
              name="email"
              type="email"
              required
              placeholder="teammate@company.com"
              className="mt-1.5 w-full rounded-lg border border-edge bg-paper/50 px-3 py-2 text-[13.5px] outline-none transition-colors focus:border-iris focus:bg-surface"
            />
          </div>
          <div>
            <label htmlFor="share-role" className="text-[12.5px] font-semibold text-ink">
              Role
            </label>
            <select
              id="share-role"
              name="role"
              defaultValue="viewer"
              className="mt-1.5 rounded-lg border border-edge bg-paper/50 px-3 py-2 text-[13.5px] outline-none transition-colors focus:border-iris focus:bg-surface"
            >
              <option value="viewer">Viewer</option>
              {canGrantEditor && <option value="editor">Editor</option>}
            </select>
          </div>
          <button
            type="submit"
            className="rounded-lg bg-ink px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-ink/80"
          >
            Share
          </button>
        </form>

        {shareError && (
          <p className="mt-2.5 text-[12px] text-rose-600">{shareError}</p>
        )}
      </div>

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
