"use client";

import type { FirebaseOptions } from "firebase/app";

import { ensureFirebaseClient, isFirebaseClientReady } from "@/lib/firebase/client";
import { isFirebaseWebConfigValid } from "@/lib/firebase/public-config";

type Props = {
  config: FirebaseOptions;
  children: React.ReactNode;
};

export function FirebaseRootProvider({ config, children }: Props) {
  if (isFirebaseWebConfigValid(config) && !isFirebaseClientReady()) {
    ensureFirebaseClient(config);
  }
  return <>{children}</>;
}
