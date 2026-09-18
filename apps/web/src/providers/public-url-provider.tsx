"use client";

import { createContext, useContext, type ReactNode } from "react";

const PublicUrlContext = createContext<string | undefined>(undefined);

export interface PublicUrlProviderProps {
  appUrl: string;
  children: ReactNode;
}

export const PublicUrlProvider = ({
  appUrl,
  children,
}: PublicUrlProviderProps) => (
  <PublicUrlContext.Provider value={appUrl}>
    {children}
  </PublicUrlContext.Provider>
);

/** Runtime `APP_URL` from the server, or `undefined` outside the provider. */
export const usePublicAppUrl = () => useContext(PublicUrlContext);
