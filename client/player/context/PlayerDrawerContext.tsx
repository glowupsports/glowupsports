import React, { createContext, useContext, useState, ReactNode } from "react";

type DrawerContextType = {
  openDrawer: () => void;
  closeDrawer: () => void;
  isOpen: boolean;
  setOpenDrawer: (fn: () => void) => void;
};

const DrawerContext = createContext<DrawerContextType>({
  openDrawer: () => {},
  closeDrawer: () => {},
  isOpen: false,
  setOpenDrawer: () => {},
});

export const usePlayerDrawer = () => useContext(DrawerContext);

export function PlayerDrawerProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [openDrawerFn, setOpenDrawerFn] = useState<() => void>(() => () => {});

  const openDrawer = () => {
    openDrawerFn();
    setIsOpen(true);
  };

  const closeDrawer = () => {
    setIsOpen(false);
  };

  const setOpenDrawer = (fn: () => void) => {
    setOpenDrawerFn(() => fn);
  };

  return (
    <DrawerContext.Provider value={{ openDrawer, closeDrawer, isOpen, setOpenDrawer }}>
      {children}
    </DrawerContext.Provider>
  );
}
