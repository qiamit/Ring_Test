import type { Metadata, Viewport } from "next";

import { FirebaseRootProvider } from "@/components/firebase/firebase-root-provider";
import { getFirebasePublicConfigForRuntime } from "@/lib/firebase/public-config";

import "./globals.css";

export const metadata: Metadata = {
  title: "Ring Test Manager — IS 1786:2008",
  description:
    "Web-based ring test (IS 1786) measurement workflow with Firebase auth, Firestore, and storage.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#0b1220",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const firebaseConfig = getFirebasePublicConfigForRuntime();

  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-[--color-background] text-[--color-foreground] antialiased">
        <FirebaseRootProvider config={firebaseConfig}>{children}</FirebaseRootProvider>
      </body>
    </html>
  );
}
