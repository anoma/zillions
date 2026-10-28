import React, { useState } from "react";

import { useVault } from "../context/VaultContext";
import { Button } from "./Button";
import { Notice } from "./Notice";
import { PasswordField } from "./PasswordField";

type PasswordGateProps = {
  /** What the password unlocks, e.g. "your seed phrase". */
  what: string;
  submitLabel: string;
  /** Runs once the password checks out. */
  onVerified: () => Promise<void>;
};

/** Asks for the password again before a secret is shown. */
export const PasswordGate = ({ what, submitLabel, onVerified }: PasswordGateProps) => {
  const { checkPassword } = useVault();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setError(undefined);
    setPending(true);
    try {
      if (!(await checkPassword(password))) {
        setError("Incorrect password");
        return;
      }
      await onVerified();
    } catch (err) {
      setError(`${err}`);
    } finally {
      setPending(false);
    }
  };

  return (
    <form className="flex flex-col flex-1" onSubmit={(e) => void handleSubmit(e)}>
      <Notice tone="neutral" className="mt-3.5">
        Enter your password to show {what}.
      </Notice>
      <div className="mt-4">
        <PasswordField
          autoFocus
          label="Password"
          value={password}
          error={error}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      <div className="mt-auto pt-4 pb-5">
        <Button type="submit" block disabled={!password || pending}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
};
