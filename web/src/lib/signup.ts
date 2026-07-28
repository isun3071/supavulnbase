// SIGNUP DIAL.
//
// Registration is where graders fail in the field, and this fixture registers
// successfully — so none of the real failure modes reproduce here and a
// grader's handling of them cannot be verified. These modes reproduce the
// measured taxonomy from 120 hackathon apps, with the frequencies observed.
//
//   normal       canonical. /signup is linked, the form works, a session is
//                granted. Unchanged from every previous build.
//
//   interaction  27.5%. There is NO conventional signup route and no link in
//                the served HTML. The form exists only after a client-side
//                interaction. A crawler that does not click never finds it.
//
//   unlabeled    26.7%. /signup is linked and looks fine, but one required
//                input has no name, id, placeholder or aria-label, and its
//                caption lives in a sibling element that is not associated with
//                it. A filler that locates inputs by accessible name leaves it
//                empty, HTML5 validation blocks submit, and NO REQUEST IS EVER
//                SENT. The failure is silent on both sides.
//
//   login-only   the homepage is a login form and the real signup lives at
//                /signup, linked from nowhere. A grader that fills the first
//                form it sees submits credentials to LOGIN and never walks to
//                the registration route.
//
//   confirm      15.0%. CONTROL. Signup genuinely succeeds but grants no
//                session, because the deployment requires email confirmation.
//                Everything downstream is correctly unreachable. A grader must
//                report this as N/A, not as a failure to register.
//
//   sso          7.5%. CONTROL. Self-registration is not offered at all.
//                Also correctly untestable.
//
// The two controls carry as much weight as the defects: without them there is
// no way to separate "the grader is broken" from "the target is legitimately
// untestable".
export type SignupMode =
  | 'normal'
  | 'interaction'
  | 'unlabeled'
  | 'login-only'
  | 'confirm'
  | 'sso'

export const SIGNUP_MODE = (process.env.NEXT_PUBLIC_SIGNUP_MODE ?? 'normal') as SignupMode

export const signupMode = (m: SignupMode) => SIGNUP_MODE === m

// Whether a conventional, linked /signup route is discoverable by crawling.
export const signupIsLinked = () => !['interaction', 'login-only'].includes(SIGNUP_MODE)
