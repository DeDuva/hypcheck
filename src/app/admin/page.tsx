import Link from "next/link";
import { addAllowedEmailAction, removeAllowedEmailAction, updateUserRoleAction } from "@/lib/actions";
import { envAllowedEmails } from "@/lib/auth";
import { requireAdmin } from "@/lib/authz";
import { listAllowedEmails, listUsers } from "@/lib/store";
import { GLOBAL_ROLE_LABELS, GRANTABLE_MODEL_FAMILIES, type GlobalRole } from "@/lib/types";

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

      {roleError && <p className="mt-2.5 text-[12px] text-rose-600">{roleError}</p>}

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
              <li key={user.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium text-ink">
                    {user.name}
                    {isSelf && <span className="ml-1.5 text-[11px] font-normal text-ink-faint">(you)</span>}
                  </p>
                  <p className="truncate text-[12px] text-ink-faint">{user.email}</p>
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
                      <span
                        className="flex items-center gap-2 rounded-lg border border-edge bg-paper/50 px-2.5 py-1.5"
                        title="Premium model access — Haiku and Sonnet are always available; these grant Opus and Fable"
                      >
                        {GRANTABLE_MODEL_FAMILIES.map((f) => (
                          <label key={f} className="flex cursor-pointer items-center gap-1 text-[11.5px] capitalize text-ink-soft">
                            <input
                              type="checkbox"
                              name={`model_${f}`}
                              defaultChecked={user.modelAccess.includes(f)}
                              className="h-3 w-3 accent-[var(--color-iris)]"
                            />
                            {f}
                          </label>
                        ))}
                      </span>
                      <button
                        type="submit"
                        className="rounded-lg bg-ink px-3 py-1.5 text-[12.5px] font-medium text-white transition-colors hover:bg-ink/80"
                      >
                        Update
                      </button>
                    </form>
                    {envCovered ? (
                      <span
                        title="Also allowed via the ALLOWED_EMAILS env var — removing access here wouldn't take effect until that's edited too"
                        className="cursor-help rounded-md px-2 py-1.5 text-[11px] font-medium uppercase tracking-wide text-ink-faint ring-1 ring-inset ring-edge"
                      >
                        env
                      </span>
                    ) : (
                      <form action={removeAllowedEmailAction.bind(null, user.email)}>
                        <button
                          type="submit"
                          className="rounded-md px-2.5 py-1.5 text-[12px] font-medium text-rose-600/80 transition-colors hover:bg-rose-50 hover:text-rose-700"
                        >
                          Remove access
                        </button>
                      </form>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
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
                  <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-[11.5px] font-medium capitalize text-amber-700 ring-1 ring-inset ring-amber-200">
                    {GLOBAL_ROLE_LABELS[a.role]}
                  </span>
                  <form action={removeAllowedEmailAction.bind(null, a.email)}>
                    <button
                      type="submit"
                      className="rounded-md px-2.5 py-1 text-[12px] font-medium text-rose-600/80 transition-colors hover:bg-rose-50 hover:text-rose-700"
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
