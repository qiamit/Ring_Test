# Ring Test Manager (Web)

Next.js app for IS 1786 ring test measurement workflow, backed by **Firebase** (Auth, Firestore, Storage, Hosting).

## Stack

- **Next.js 16** (App Router)
- **Firebase Authentication** (email/password)
- **Cloud Firestore** (tests, settings, calibrations)
- **Firebase Storage** (`ring-images`, `company-logos`)
- **Firebase Hosting** (framework-aware deploy)

## Local setup

1. Copy the env template and add your keys locally (never commit `.env.local`):

   ```bash
   cp .env.example .env.local
   ```

   Fill values from [Firebase Console](https://console.firebase.google.com/project/ring-test-manager/settings/general) → Your apps.

2. In [Firebase Console](https://console.firebase.google.com/project/ring-test-manager), enable:
   - Authentication → Email/Password
   - Firestore Database
   - Storage

3. Add a **service account** key (Project settings → Service accounts → Generate new private key) and set either:
   - `FIREBASE_SERVICE_ACCOUNT_JSON` (full JSON, one line), or
   - `FIREBASE_CLIENT_EMAIL` + `FIREBASE_PRIVATE_KEY`

4. Log in to Firebase CLI and link the project:

   ```bash
   npm run firebase:login
   npx -y firebase-tools@latest use ring-test-manager
   ```

5. Deploy security rules and indexes:

   ```bash
   npm run firebase:deploy:rules
   ```

6. Create Storage buckets `ring-images` and `company-logos` (public read) in the console if not auto-created.

7. Install and run:

   ```bash
   npm install
   npm run dev
   ```

## SaaS organization approval

- **Super Admin** (`APP_OWNER_EMAIL`, default `qicoding1@gmail.com`): signs in normally, uses **Dashboard** and **Organizations** in the sidebar to approve or reject firms.
- **Firms**: register at `/signup` with firm name, contact name, email, and password. They receive no app session until approved; after approval they sign in at `/login`.
- Deploy updated Firestore rules after pulling: `npm run firebase:deploy:rules`
- Ensure **Blaze** billing is enabled if using Storage uploads.

## Deploy (App Hosting)

Production environment variables live in **Firebase Console** only:

[App Hosting → ring-manager-backend → Settings → Environment](https://console.firebase.google.com/project/ring-test-manager/apphosting)

Push to `main` on GitHub to trigger a rollout. Do not put secrets in `apphosting.yaml` or `.env.example`.

## Project layout

```
app/                 # Routes and server actions
lib/firebase/        # Firebase client, admin, Firestore helpers
firestore.rules      # Firestore security rules
storage.rules        # Storage security rules
firebase.json        # Firebase project config
```
