// HARDENING SWITCH for the reference build.
//
// The hardened reference must be a MINIMAL DIFF from the vulnerable target:
// only the named flaw class is fixed and nothing else is tidied. Otherwise a
// differential picks up incidental changes and the delta cannot be attributed.
//
// Gating behaviour on one env var — rather than maintaining a second, cleaned-up
// copy of the app — is what guarantees that. Same source, same build, same
// image layers, same everything; exactly one class of behaviour changes.
//
// Values: none | rls | secrets | authz | injection | headers | auth | qa | perf | all
//
// NEXT_PUBLIC_ so client components can read it too. The value is not a secret
// and appearing in the bundle is harmless — it says which class is fixed, not
// how anything is fixed.
export const HARDEN_CLASS = process.env.NEXT_PUBLIC_HARDEN_CLASS ?? 'none'

export function hardened(cls: string): boolean {
  return HARDEN_CLASS === 'all' || HARDEN_CLASS === cls
}
