/**
 * Unlock screen. `onLogin` resolves to whether the password was correct.
 * Shared with the approval window's login gate.
 */
import React, { useState } from "react";

import { ZEmblem } from "@zillions/components/assets/ZEmblem";

import { Button } from "../ui/Button";
import { PasswordField } from "../ui/PasswordField";
import { Footer } from "../ui/Row";
import { KEYCHAIN_VERSION } from "../version";

enum Status {
  Idle,
  Pending,
  InvalidPassword,
  Failed,
}

type LoginProps = {
  onLogin: (password: string) => Promise<boolean>;
};

export const Login = ({ onLogin }: LoginProps) => {
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<Status>(Status.Idle);

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setStatus(Status.Pending);
    try {
      const unlocked = await onLogin(password);
      setStatus(unlocked ? Status.Idle : Status.InvalidPassword);
    } catch (err) {
      console.error(err);
      setStatus(Status.Failed);
    }
  };

  const errorMessage =
    status === Status.Failed ? "Something went wrong. Try again."
    : status === Status.InvalidPassword ? "Incorrect password"
    : undefined;

  return (
    <form className="flex flex-col flex-1" onSubmit={(e) => void handleSubmit(e)}>
      {/* 11:9 spacers: the gap under the Z is 10% shorter than centring gives. */}
      <div className="flex flex-1 flex-col items-center">
        <div className="grow-[11]" />
        <ZEmblem className="w-[220px]" />
        <div className="grow-[9]" />
      </div>
      <h1 className="m-0 mb-4 text-center text-[15px] font-semibold">
        Welcome back
      </h1>
      <PasswordField
        autoFocus
        aria-label="Password"
        placeholder="Password"
        value={password}
        disabled={status === Status.Pending}
        onChange={(e) => setPassword(e.target.value)}
        error={errorMessage}
      />
      <Button
        type="submit"
        block
        className="mt-4"
        disabled={status === Status.Pending || password.length === 0}
      >
        Unlock
      </Button>
      <Footer className="!mt-8 !justify-center">
        <span>Zillions Keychain {KEYCHAIN_VERSION}</span>
      </Footer>
    </form>
  );
};
