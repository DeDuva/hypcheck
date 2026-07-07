import Link from "next/link";
import { updateUserRoleAction } from "@/lib/actions";
import { requireAdmin } from "@/lib/authz";
import { listUsers } from "@/lib/store";
import { GLOBAL_ROLE_LABELS, type GlobalRole } from "@/lib/types";

export const dynamic = "force-dynamic";

const ROLES: GlobalRole[] = ["admin", "creator", "member"];

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ roleError?: string }>;
}) {
  const viewer = await requireAdmin();
  const { roleError } = await searchParams;
  const users = await listUsers();

  return (
    <div className="mx-auto max-w-2xl px-6 py-10 lg:px-8">
      <div className="flex items-center gap-2 text-[12px] text-ink-faint">
        <Link href="/" className="transition-colors hover:text-ink">
          Dashboard
        </Link>
        <span aria-hidden>/</span>
        <span className="text-ink-soft">Admin</span>
      </div>

      <h1 className="mt-2 text-[22px] font-semibold tracking-tight">Users</h1>
      <p className="mt-1 text-[12.5px] text-ink-faint">
        Global role controls whether a user can create hypchecks (<code className="font-mono">creator</code>/
        <code className="font-mono">admin</code>) or only see what&apos;s shared with them (
        <code className="font-mono">member</code>). Admins implicitly get access to every hypcheck.
      </p>

      {roleError && <p className="mt-2.5 text-[12px] text-rose-600">{roleError}</p>}

      <div className="mt-6 rounded-2xl border border-edge bg-surface p-6 shadow-card">
        <ul className="divide-y divide-edge">
          {users.map((user) => {
            const isSelf = user.id === viewer.id;
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
                  <form action={updateUserRoleAction.bind(null, user.id)} className="flex shrink-0 items-center gap-2">
                    <select
                      name="role"
                      defaultValue={user.role}
                      className="rounded-lg border border-edge bg-paper/50 px-2.5 py-1.5 text-[12.5px] outline-none transition-colors focus:border-iris focus:bg-surface"
                    >
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
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
