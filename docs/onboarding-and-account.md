# Welcome, setup and account settings

The site intro plays once per browser session, with a skip control. It reuses Whereto's existing illustrations and fades into a curved reveal. Setup is a full-page, four-step experience: people, destinations and dates, budget, then review. Three pastel shapes travel between defined positions as the step changes. Form state remains outside the animated panels; completed steps can be revisited and each incoming question receives focus.

The design follows the existing `animate` and `emil-design-eng` skills: short, interruptible control motion, bounded content transitions, and transform/opacity animation for decorative shapes. Keyboard interaction, system reduced motion and the user's own reduced-motion preference bypass decorative transitions. Main content remains usable during the site intro.

Setup drafts remain on the device, scoped by user ID. If storage is unavailable, the page explains that the draft cannot persist. Account planning defaults populate a fresh draft. The planner sidebar uses sticky positioning in normal document flow, in both expanded and compact modes.

## Help

`GuidedHelp` contains five dashboard topics and twenty-five planner topics. The first visit offers a dismissible introduction; Help & guides remains available afterward. Lessons explain the real tools and can open them directly, with focus handed back to the help launcher after dismissal. Welcome-dismissal state is scoped to the user and workspace on this device. Account settings can replay either walkthrough.

## Account settings

`/app/settings` provides profile and verified-email changes; password changes; authenticator enrollment with recovery codes; active-session revocation; persistent planning and display preferences; subscription status and the existing billing portal; data export; local draft cleanup; and tutorials. Billing availability follows the existing server configuration. Export includes the profile, preferences and accessible trip data; attached files are downloaded separately through each trip's Documents.

Authentication actions use the existing Better Auth client and server. Password changes revoke other sessions. Session lists refresh after security actions because Better Auth may rotate the current cookie. Recovery secrets remain in component state and are removed after completion or cancellation. Cancel is explicitly a non-submit button. Existing administrator protections remain in place.

Preferences are validated by a strict shared Zod schema. `PATCH /api/v1/me/preferences` derives the target user exclusively from the verified session and uses the API's origin protection. `GET /api/v1/me` supplies defaults for older records. The migration `20260911020000_user_preferences` adds a JSONB preferences column without changing existing trip data. Apply it with `npm run db:migrate` when deploying, and generate Prisma's client with `npm run db:generate`.

## Validation

- `tests/account-settings.test.ts` exercises the real local API and authentication service with disposable users: authorization, strict preference validation, profile/password changes, session revocation and authenticator activation/deactivation.
- `tests/browser/experience.spec.ts` checks intro replay, setup progress and draft persistence, account preference persistence and errors, guide handoffs, sticky navigation and cancelling authenticator enrollment.
- `artifacts/ui-responsive/experience.mjs` captures every settings section and the guide at 320, 390 and 1440 pixels and records horizontal overflow.

API behavior was checked against the installed Better Auth source and its official [user/account](https://better-auth.com/docs/concepts/users-accounts), [two-factor](https://better-auth.com/docs/plugins/2fa) and [session](https://better-auth.com/docs/concepts/session-management) documentation.
