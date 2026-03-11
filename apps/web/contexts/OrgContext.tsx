'use client';

import React, { createContext, useContext } from 'react';
import type { Org } from '../types/org';

interface OrgContextValue {
  org: Org | null;
}

const OrgContext = createContext<OrgContextValue>({ org: null });

export const useOrg = () => useContext(OrgContext);

export function OrgProvider({
  org,
  children,
}: {
  org: Org | null;
  children: React.ReactNode;
}) {
  return <OrgContext.Provider value={{ org }}>{children}</OrgContext.Provider>;
}

