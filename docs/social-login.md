# Continue with Google / Apple

The sign-in and sign-up pages show **Continue with Google** and **Continue with Apple** side by side under the main button. A button only works once its keys are in `.env`. Until then it is shown faded with a setup hint during development, and hidden in production.

## What gets stored, and where

Everything lives in the same PostgreSQL database as the rest of the app:

| What                                    | Where                                                                                                                                                 |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| The person                              | `user`: name, email, `emailVerified = true` (Google and Apple have already verified it)                                                               |
| The link to their Google/Apple identity | `account`: `providerId` is `google` or `apple`, `accountId` is their stable Google/Apple ID. Tokens are encrypted (AES-256-GCM) before they are saved |
| Every sign-in                           | `LoginEvent`, with `method` = `google`, `apple`, `password` or `email_link`                                                                           |

You can see this in Admin → Users → Manage (sign-in methods with dates) and Admin → Sign-in & security ("login success via Google"). In SQL: `SELECT email, sign_in_methods, last_login_method FROM reporting.users;`.

How accounts are matched:

- **First time with Google or Apple:** a new account is created. No password is needed; the person can add one later from Settings with a reset email.
- **Same email as an existing account:** the Google/Apple identity is linked to that account, because both providers confirm the person owns the email. People keep one account, whichever button they use.
- **Apple "Hide My Email":** Apple gives a private relay address (`…@privaterelay.appleid.com`), so this becomes a separate account. Emails to that address still reach the person.
- **Two-factor still applies.** Someone with an authenticator turned on gets the code prompt after Google or Apple, just as after a password. Admin always asks for its own code too.
- **Always kept logged in.** Google and Apple sign-ins stay signed in for 30 days, as if "Keep me logged in" were ticked.

## Google setup (free, about 10 minutes)

1. Open [Google Cloud Console](https://console.cloud.google.com/) and create a project (for example "Whereto").
2. **APIs & Services → OAuth consent screen:** choose _External_. Fill in the app name, support email and logo, and add the `email`, `profile` and `openid` scopes. While the app is in _Testing_, only test users you add can sign in. Publish it when you go live.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID → Web application.**
   - Authorized JavaScript origins: `http://localhost:5173`, and later `https://your-domain`
   - Authorized redirect URIs: `http://localhost:5173/api/auth/callback/google`, and later `https://your-domain/api/auth/callback/google`
4. Copy the client ID and secret into `.env` and restart `npm run dev`:

   ```sh
   GOOGLE_CLIENT_ID=1234567890-abc.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=GOCSPX-...
   ```

## Apple setup (needs the Apple Developer Program, $99/year)

Apple does not allow `localhost`. Its return address must be a real domain over HTTPS, so test Apple on your deployed site or through an HTTPS tunnel (for example `cloudflared tunnel --url http://localhost:5173`, then use that address as `APP_URL`).

1. In [Certificates, Identifiers & Profiles](https://developer.apple.com/account/resources/identifiers/list):
   1. **Identifiers → App IDs → +**, then enable _Sign in with Apple_ on your App ID.
   2. **Identifiers → Services IDs → +** (for example `com.whereto.web`). This is your `APPLE_CLIENT_ID`. Enable _Sign in with Apple_, choose the App ID as primary, and add:
      - Domains: `your-domain`
      - Return URLs: `https://your-domain/api/auth/callback/apple`
   3. **Keys → +**, enable _Sign in with Apple_, and link it to the App ID. Download the `.p8` file; Apple only lets you download it once. Note the **Key ID**.
2. Your **Team ID** is in the top right of the developer portal.
3. Fill in `.env`:

   ```sh
   APPLE_CLIENT_ID=com.whereto.web
   APPLE_TEAM_ID=ABCDE12345
   APPLE_KEY_ID=XYZ9876543
   # The whole .p8 file on one line, with \n where the line breaks were:
   APPLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIGT...\n-----END PRIVATE KEY-----"
   ```

Apple has no fixed client secret. The API signs a fresh one from the `.p8` key and renews it monthly, so nothing expires behind your back. If the key is malformed, the API logs `Apple sign-in is disabled` and the button stays faded (hidden in production).

Apple shares the person's name only the very first time they sign in to Whereto. If you delete and recreate a test account, remove Whereto in the Apple ID settings (_Sign in with Apple → Stop using_) to see the name again.

## If something goes wrong

People are sent back to the sign-in page with a short message. Common causes:

| Symptom                                                    | Fix                                                                                         |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Google says `redirect_uri_mismatch`                        | The redirect URI in Google Cloud must match `APP_URL` + `/api/auth/callback/google` exactly |
| Google says the app is not verified, or blocks the account | Add the account as a test user, or publish the consent screen                               |
| Apple says `invalid_client`                                | Check the Services ID, Team ID, Key ID and `.p8` key, and that the return URL is registered |
| Button stays faded                                         | The variables aren't loaded. Check the spelling, then restart the API                       |
