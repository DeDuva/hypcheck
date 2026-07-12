import Link from "next/link";
import { addAllowedEmailAction, removeAllowedEmailAction, setModelTierAction, updateUserRoleAction } from "@/lib/actions";
import { envAllowedEmails } from "@/lib/auth";
import { requireAdmin } from "@/lib/authz";
import { listAllowedEmails, listUsers } from "@/lib/store";
import { GLOBAL_ROLE_LABELS, MODEL_FAMILIES, MODEL_FAMILY_LABELS, type GlobalRole } from "@/lib/types";

export const dynamic = "force-dynamic";

const ROLES: GlobalRole[] = ["admin", "creator", "member"];

const selectCls =
  "rounded-lg border border-edge bg-paper/50 px-2.5 py-1.5 text-[12.5px] outline-none transition-colors focus:border-iris focus:bg-surface";

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ roleError?: string }>;
}) {
  const viewer = await requireAdmin();
  const { roleError } = await searchParams;
  const [users, allowedEmails] = await Promise.all([listUsers(), listAllowedEmails()]);
  const envEmails = new Set(envAllowedEmails());
  const userEmails = new Set(users.map((u) => u.email.toLowerCase()));
  const pending = allowedEmails.filter((a) => !userEmails.has(a.email));

  return (
    <div className="mx-auto max-w-2xl px-6 py-10 lg:px-8">
      <div className="flex items-center gap-2 text-[12px] text-ink-faint">
        <Link href="/" className="transition-colors hover:text-ink">
          Dashboard
        </Link>
        <span aria-hidden>/</span>
        <span className="text-ink-soft">Admin</span>
      </div>

      <div className="mt-2 flex items-center justify-between gap-3">
        <h1 className="text-[22px] font-semibold tracking-tight">Users</h1>
        <Link
          href="/admin/traces"
          className="rounded-lg border border-edge bg-surface px-3 py-1.5 text-[12.5px] font-medium text-ink-soft transition-colors hover:border-edge-strong hover:text-ink"
        >
          API call profiling →
        </Link>
      </div>
      <p className="mt-1 text-[12.5px] text-ink-faint">
        Global role controls whether a user can create hypchecks (<code className="font-mono">creator</code>/
        <code className="font-mono">admin</code>) or only see what&apos;s shared with them (
        <code className="font-mono">member</code>). Admins implicitly get access to every hypcheck.
      </p>

      {roleError && <p className="mt-2.5 text-[12px] text-band-weak">{roleError}</p>}

      <div className="mt-6 rounded-2xl border border-edge bg-surface p-6 shadow-card">
        <h2 className="text-[13.5px] font-semibold text-ink">Add a user</h2>
        <p className="mt-1 text-[12.5px] text-ink-faint">
          Hypcheck is invite-only — an email has to be added here before it can sign in. They&apos;ll get the role
          you pick the moment they sign in with Google; existing accounts are updated immediately.
        </p>
        <form action={addAllowedEmailAction} className="mt-3 flex items-end gap-2">
          <div className="flex-1">
            <label htmlFor="add-email" className="text-[11.5px] font-medium text-ink-faint">
              Email
            </label>
            <input
              id="add-email"
              name="email"
              type="email"
              required
              placeholder="teammate@company.com"
              className="mt-1 w-full rounded-lg border border-edge bg-paper/50 px-3 py-2 text-[13.5px] outline-none transition-colors focus:border-iris focus:bg-surface"
            />
          </div>
          <div>
            <label htmlFor="add-role" className="text-[11.5px] font-medium text-ink-faint">
              Role
            </label>
            <select id="add-role" name="role" defaultValue="member" className={`mt-1 ${selectCls}`}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {GLOBAL_ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            className="rounded-lg bg-iris px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-iris-deep"
          >
            Add
          </button>
        </form>
      </div>

      <div className="mt-5 rounded-2xl border border-edge bg-surface p-6 shadow-card">
        <ul className="divide-y divide-edge">
          {users.map((user) => {
            const isSelf = user.id === viewer.id;
            const envCovered = envEmails.has(user.email.toLowerCase());
            return (
              <li key={user.id} className="space-y-2 py-3">
                {/* Line 1: identity + role/membership controls */}
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium text-ink">
                      {user.name}
                      {isSelf && <span className="ml-1.5 text-[11px] font-normal text-ink-faint">(you)</span>}
                    </p>
                    <p className="truncate text-[12px] text-ink-faint">
                      {user.email}
                      {envCovered && <span className="ml-1.5 text-[11px] text-stance-hold">· also on env allowlist*</span>}
                    </p>
                  </div>
                  {isSelf ? (
                    <span className="rounded-full bg-paper px-2.5 py-0.5 text-[11.5px] font-medium text-ink-soft ring-1 ring-inset ring-edge">
                      {GLOBAL_ROLE_LABELS[user.role]}
                    </span>
                  ) : (
                    <div className="flex shrink-0 items-center gap-2">
                      <form action={updateUserRoleAction.bind(null, user.id)} className="flex items-center gap-2">
                        <select name="role" defaultValue={user.role} className={selectCls}>
                          {ROLES.map((r) => (
                            <option key={r} value={r}>
                              {GLOBAL_ROLE_LABELS[r]}
                            </option>
                          ))}
                        </select>
                        <button
                          type="submit"
                          className="rounded-lg bg-ink px-3 py-1.5 text-[12.5px] font-medium text-white transition-colors hover:bg-ink/80"
                        >
                          Update
                        </button>
                      </form>
                      {!envCovered && (
                        <form action={removeAllowedEmailAction.bind(null, user.email)}>
                          <button
                            type="submit"
                            className="rounded-md px-2.5 py-1.5 text-[12px] font-medium text-band-weak/80 transition-colors hover:bg-band-weak-tint hover:text-band-weak"
                          >
                            Remove access
                          </button>
                        </form>
                      )}
                    </div>
                  )}
                </div>

                {/* Line 2: model access — instant per-family toggles, no shared Update button */}
                <div className="flex items-center gap-2">
                  <span className="text-[11.5px] font-medium uppercase tracking-wide text-ink-faint">Models</span>
                  {user.role === "admin" ? (
                    <span className="rounded-full bg-iris-soft px-2.5 py-0.5 text-[11.5px] font-medium text-iris">
                      All models (admin)
                    </span>
                  ) : (
                    <>
                      {/* Rating-scale control: Haiku (floor, always on) at the left, Fable at the
                          right. Picking a tier grants it and every cheaper one to its left — this
                          is a ladder, not independent toggles, so it renders as one joined bar. */}
                      <div className="inline-flex overflow-hidden rounded-full ring-1 ring-inset ring-edge">
                        {MODEL_FAMILIES.map((f) => {
                          const included = MODEL_FAMILIES.indexOf(f) <= MODEL_FAMILIES.indexOf(user.modelTier);
                          const isMax = f === user.modelTier;
                          return (
                            <form key={f} action={setModelTierAction.bind(null, user.id, f)}>
                              <button
                                type="submit"
                                title={`Set ${user.name}'s model access up to ${MODEL_FAMILY_LABELS[f]}`}
                                className={`border-r border-edge px-3 py-1 text-[11.5px] font-medium capitalize transition-colors last:border-r-0 ${
                                  included
                                    ? `bg-band-strong-tint text-band-strong hover:bg-band-strong-tint/70 ${isMax ? "ring-2 ring-inset ring-band-strong/50" : ""}`
                                    : "bg-paper text-ink-faint hover:bg-surface hover:text-ink-soft"
                                }`}
                              >
                                {f}
                              </button>
                            </form>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
        {users.some((u) => envEmails.has(u.email.toLowerCase())) && (
          <p className="mt-3 border-t border-edge pt-3 text-[11.5px] text-ink-faint">
            *Also on env allowlist: this email is additionally allowed via the <code className="font-mono">ALLOWED_EMAILS</code>{" "}
            environment variable in Vercel. Removing access here won&apos;t lock them out until that variable is edited too.
          </p>
        )}
      </div>

      {pending.length > 0 && (
        <div className="mt-5 rounded-2xl border border-edge bg-surface p-6 shadow-card">
          <h2 className="text-[13.5px] font-semibold text-ink">Invited — not yet signed in</h2>
          <p className="mt-1 text-[12.5px] text-ink-faint">
            Activates into a real account at the role shown the first time they sign in with Google.
          </p>
          <ul className="mt-3 divide-y divide-edge border-t border-edge">
            {pending.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 py-2.5">
                <p className="truncate text-[13px] text-ink">{a.email}</p>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="rounded-full bg-stance-hold-tint px-2.5 py-0.5 text-[11.5px] font-medium capitalize text-stance-hold ring-1 ring-inset ring-stance-hold/25">
                    {GLOBAL_ROLE_LABELS[a.role]}
                  </span>
                  <form action={removeAllowedEmailAction.bind(null, a.email)}>
                    <button
                      type="submit"
                      className="rounded-md px-2.5 py-1 text-[12px] font-medium text-band-weak/80 transition-colors hover:bg-band-weak-tint hover:text-band-weak"
                    >
                      Revoke
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
