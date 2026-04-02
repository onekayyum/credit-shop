import {
  type PropsWithChildren,
  type ReactNode,
  createContext,
  createElement,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

export type Status =
  | "initializing"
  | "idle"
  | "logging-in"
  | "success"
  | "loginError";

export type InternetIdentityContext = {
  identity?: unknown;
  login: () => void;
  clear: () => void;
  loginStatus: Status;
  isInitializing: boolean;
  isLoginIdle: boolean;
  isLoggingIn: boolean;
  isLoginSuccess: boolean;
  isLoginError: boolean;
  loginError?: Error;
};

const InternetIdentityReactContext = createContext<
  InternetIdentityContext | undefined
>(undefined);

function assertProviderPresent(
  context: InternetIdentityContext | undefined,
): asserts context is InternetIdentityContext {
  if (!context) {
    throw new Error(
      "InternetIdentityProvider is not present. Wrap your component tree with it.",
    );
  }
}

export const useInternetIdentity = (): InternetIdentityContext => {
  const context = useContext(InternetIdentityReactContext);
  assertProviderPresent(context);
  return context;
};

export function InternetIdentityProvider({
  children,
}: PropsWithChildren<{ children: ReactNode }>) {
  const [loginStatus, setLoginStatus] = useState<Status>("idle");

  const login = useCallback(() => {
    setLoginStatus("success");
  }, []);

  const clear = useCallback(() => {
    setLoginStatus("idle");
  }, []);

  const value = useMemo(
    () => ({
      identity: undefined,
      login,
      clear,
      loginStatus,
      isInitializing: loginStatus === "initializing",
      isLoginIdle: loginStatus === "idle",
      isLoggingIn: loginStatus === "logging-in",
      isLoginSuccess: loginStatus === "success",
      isLoginError: loginStatus === "loginError",
      loginError: undefined,
    }),
    [clear, login, loginStatus],
  );

  return createElement(
    InternetIdentityReactContext.Provider,
    { value },
    children,
  );
}
