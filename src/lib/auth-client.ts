"use client";

import { createAuthClient } from "better-auth/react";

/** Browser-side auth client (sign-in / sign-out). Server code uses lib/auth. */
export const authClient = createAuthClient();
