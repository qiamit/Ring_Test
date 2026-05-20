# App Hosting environment variables

Set these in [Firebase Console → App Hosting → ring-manager-backend → Settings → Environment](https://console.firebase.google.com/project/ring-test-manager/apphosting).

For each variable, enable **BUILD** and **RUNTIME**.

**Important:** `NEXT_PUBLIC_*` variables must have **BUILD** enabled or login shows `auth/invalid-api-key` (empty API key in the browser bundle). **RUNTIME** is required for server actions (image upload, session).

| Variable | Example value |
|----------|----------------|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | From Firebase → Project settings → Your apps |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | `ring-test-manager.firebaseapp.com` |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | `ring-test-manager` |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | `ring-test-manager.firebasestorage.app` |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | `859133829166` |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | `1:859133829166:web:...` |
| `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID` | Optional |
| `APP_OWNER_EMAIL` | Super Admin email |
| `NEXT_PUBLIC_SITE_URL` | `https://ring-manager-backend--ring-test-manager.asia-southeast1.hosted.app` |

**Login error `auth/invalid-api-key`?** `NEXT_PUBLIC_FIREBASE_API_KEY` is missing or only set for RUNTIME. Enable **BUILD + RUNTIME**, paste the key from Firebase → Project settings → Your apps → Web app, then **create a new rollout**.

**Image upload error?** Set `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` with BUILD + RUNTIME (`ring-test-manager.firebasestorage.app`).

Also add your hosted URL under **Authentication → Settings → Authorized domains**.
