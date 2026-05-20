# App Hosting environment variables

Set these in [Firebase Console → App Hosting → ring-manager-backend → Settings → Environment](https://console.firebase.google.com/project/ring-test-manager/apphosting).

For each variable, enable **BUILD** and **RUNTIME** (required for server-side image upload).

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

**Image upload error?** If `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` is missing at runtime, uploads fail with “Bucket name not specified”. The app now falls back to `{projectId}.firebasestorage.app`, but you should still set the variable in the console and redeploy.

Also add your hosted URL under **Authentication → Settings → Authorized domains**.
