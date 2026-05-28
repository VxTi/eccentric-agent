import { createContext, type ReactNode, useContext } from 'react';

const ApplicationCancellationContext = createContext<{
  controller: AbortController;
} | null>(null);

export function ApplicationCancellationProvider({
  children,
  controller,
}: {
  children: ReactNode;
  controller: AbortController;
}) {
  return (
    <ApplicationCancellationContext.Provider value={{ controller }}>
      {children}
    </ApplicationCancellationContext.Provider>
  );
}

export function useSignal(): AbortSignal {
  const controller = useAbort();

  return controller.signal;
}

export function useAbort(): AbortController {
  const ctx = useContext(ApplicationCancellationContext);
  if (!ctx) {
    throw new Error(
      'ApplicationCancellationContext must be used within the application cancellation'
    );
  }
  return ctx.controller;
}
