# Onboarding

How Users move from provisioned to active. Uses vocabulary from [AGENTS.md](../AGENTS.md).

## Lifecycle states

| State     | Meaning                                                     |
| --------- | ----------------------------------------------------------- |
| `pending` | User provisioned; Membership exists; no Invitation sent yet |
| `invited` | Invitation email sent; User has not signed in               |
| `active`  | User signed in with Google; full product access             |

Provisioning always creates Membership. **Activation** completes when the User accepts the Invitation link and authenticates.

## Standard flows

### Org Admin creates a User

1. **Provisioning** — User record and Membership (role assigned)
2. **Invitation** sent immediately
3. Onboarding lifecycle → `invited`, then **Activation** after Google sign-in → `active`

### Platform Admin creates a User (Send Invite checked)

Same as org Admin flow.

### Platform Admin creates a User (Send Invite unchecked)

1. **Provisioning** only — lifecycle stays `pending`
2. Admin completes setup (role, Organization, etc.)
3. Admin sends **Invitation** later via "Send Invite"
4. Lifecycle → `invited`, then **Activation** → `active`

## OAuth gates

Sign-in with Google is allowed only when:

- The email is on `PLATFORM_ADMIN_EMAILS` (first-setup default includes `dev@example.com`, `platform@example.com`, and the Google emulate Test User `testuser@gmail.com`), or
- The email is provisioned, and
- An Invitation has been sent (lifecycle `invited` or `active`), or the User is already `active`

Blocked cases:

| Situation                                  | User sees                                                     |
| ------------------------------------------ | ------------------------------------------------------------- |
| Provisioned, no Invitation yet (`pending`) | Invitation has not been sent yet — contact your administrator |
| Email not provisioned                      | No account found — contact your administrator                 |

Unprovisioned emails cannot sign in.

## Invitation details

- Org Admins always send Invitations immediately when provisioning
- Platform Admins may defer via "Send Invite" on the platform admin panel
- Invitation TTL: **7 days** (see [ADR 0001](./adr/0001-b2b-tenancy-and-platform-admin.md))
- Accept flow: User opens link → `/accept-invitation/:id` → Google sign-in → Membership confirmed → `active`

## Related docs

- [Architecture](./architecture.md) — `convex/onboarding.ts`, `convex/lib/onboarding.ts`, `convex/auth.ts`
- [Environment](./environment.md) — Resend and emulator setup for invitation emails
- [Testing](./testing.md) — do not add tests in this repository
