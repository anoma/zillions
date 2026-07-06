/**
 * SetupContext: wires the wizard reducer + the typed BackgroundClient and
 * exposes them to steps via the `useWizard` hook. Steps read `state` and call
 * `dispatch` / `client.*`. The provider resolves whether a password is required
 * once, up front.
 */
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useState,
  type Dispatch,
  type PropsWithChildren,
} from "react";

import { createBackgroundClient, type BackgroundClient } from "../ipc/client";
import {
  initialWizardState,
  wizardReducer,
  type WizardEvent,
  type WizardState,
} from "./model/wizard";

type SetupContextValue = {
  state: WizardState;
  dispatch: Dispatch<WizardEvent>;
  client: BackgroundClient;
};

const SetupContext = createContext<SetupContextValue | null>(null);

type ProviderProps = PropsWithChildren<{
  /** Inject a client (e.g. a mock-backed one in tests); defaults to runtime. */
  client?: BackgroundClient;
}>;

export const SetupProvider = ({
  children,
  client: injectedClient,
}: ProviderProps): JSX.Element => {
  const client = useMemo(
    () => injectedClient ?? createBackgroundClient(),
    [injectedClient]
  );
  const [state, dispatch] = useReducer(
    wizardReducer,
    // Assume a password is required until the background says otherwise.
    initialWizardState(true)
  );
  const [ready, setReady] = useState(false);

  // Resolve the password requirement once, then render the flow.
  useEffect(() => {
    let cancelled = false;
    void client
      .isPasswordInitialized()
      .then((initialized) => {
        if (cancelled) return;
        dispatch({
          type: "passwordRequirementResolved",
          required: !initialized,
        });
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [client]);

  const value = useMemo(
    () => ({ state, dispatch, client }),
    [state, dispatch, client]
  );

  if (!ready) return <></>;
  return <SetupContext.Provider value={value}>{children}</SetupContext.Provider>;
};

export const useWizard = (): SetupContextValue => {
  const ctx = useContext(SetupContext);
  if (!ctx) {
    throw new Error("useWizard must be used within <SetupProvider>");
  }
  return ctx;
};
