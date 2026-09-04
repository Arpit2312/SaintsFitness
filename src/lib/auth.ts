import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { prisma } from "@/lib/db";

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  emailAndPassword: {
    enabled: true,
    // Public self-signup is disabled: SAINTS has exactly one Admin account,
    // seeded server-side (see Task 7). This blocks POST /api/auth/sign-up/email
    // AND auth.api.signUpEmail() called from server code — both share the same
    // handler in node_modules/better-auth/dist/api/routes/sign-up.mjs, which
    // throws EMAIL_PASSWORD_SIGN_UP_DISABLED unconditionally when this is true.
    // Sign-in is unaffected. Seed scripts must create the admin user directly
    // via Prisma (User + Account rows) instead of calling signUpEmail.
    disableSignUp: true,
  },
  user: {
    additionalFields: {
      // input: false means role can never be set from client-supplied request
      // data (see parseInputData in node_modules/better-auth/dist/db/schema.mjs);
      // it always resolves to defaultValue on create, never to attacker input.
      role: { type: "string", defaultValue: "ADMIN", input: false },
    },
  },
  plugins: [nextCookies()],
});
