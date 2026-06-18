/**
 * Unlock screen. `onLogin` resolves to whether the password was correct.
 */
import React, { useState } from "react";

import { ActionButton, Heading, Input, Stack } from "@zillions/components";
import { Logo } from "@zillions/components/assets/Logo";

enum Status {
  Idle,
  Pending,
  InvalidPassword,
  Failed,
}

type LoginProps = {
  onLogin: (password: string) => Promise<boolean>;
};

export const Login = ({ onLogin }: LoginProps): JSX.Element => {
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
    status === Status.Failed ? "An error has occurred"
      : status === Status.InvalidPassword ? "Incorrect Password"
        : "";

  return (
    <Stack as="form" className="py-6" gap={16} onSubmit={handleSubmit} full>
      <div className="flex flex-col justify-center flex-1 text-center pt-14">
        <Logo className="max-w-[80%] mx-auto" />
      </div>
      <Stack gap={2}>
        <Heading className="text-lg text-center text-black">
          Enter your password
        </Heading>
        <Input
          autoFocus
          placeholder="Password"
          variant="Password"
          value={password}
          disabled={status === Status.Pending}
          onChange={(e) => setPassword(e.target.value)}
          error={errorMessage}
        />
      </Stack>
      <ActionButton
        disabled={status === Status.Pending || password.length === 0}
      >
        Unlock
      </ActionButton>
    </Stack>
  );
};
