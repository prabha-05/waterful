import Image from "next/image";
import { GoogleSignInButton } from "./google-sign-in-button";

/**
 * Login — Google SSO only (decisions §3, HANDOVER §1, screenshot 13).
 * No email/password fields (README §1's password card is superseded — G4).
 */
export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-[var(--radius-card)] border border-line bg-surface p-8 shadow-sm">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <Image
            src="/waterful-zero-logo.jpeg"
            alt="WaterfulZERO"
            width={72}
            height={72}
            priority
            className="rounded-2xl"
          />
          <h1 className="text-xl font-bold text-ink">WaterfulZERO</h1>
          <p className="text-sm text-ink-3">Ad Performance OS</p>
        </div>

        <GoogleSignInButton />

        <p className="mt-6 text-center text-xs leading-relaxed text-muted">
          Sign-in is Google SSO only. Use your Gmail or Google Workspace account.
          Access requires a role assigned by an admin.
        </p>
      </div>
    </main>
  );
}
