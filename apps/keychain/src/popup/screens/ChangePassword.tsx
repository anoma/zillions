/**
 * Change the vault password: verifies the current password, checks the new one
 * with zxcvbn, and re-encrypts every stored secret in the background.
 */
import React, { useState } from "react";
import zxcvbn from "zxcvbn";

import {
  ActionButton,
  Alert,
  GapPatterns,
  Input,
  Stack,
} from "@zillions/components";
import { useNavigate } from "react-router-dom";

import { useVault } from "../context/VaultContext";
import routes from "../routes";
import { PageHeader } from "../ui/PageHeader";

enum Status {
  Unsubmitted,
  Pending,
  Complete,
  Failed,
}

export const ChangePassword = (): JSX.Element => {
  const navigate = useNavigate();
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [status, setStatus] = useState<Status>(Status.Unsubmitted);
  const [errorMessage, setErrorMessage] = useState("");
  const { changePassword } = useVault();
  const { feedback } = zxcvbn(newPassword);

  const hasFeedback =
    feedback.warning !== "" || feedback.suggestions.length > 0;
  const match = newPassword === confirmNewPassword;

  const shouldDisableSubmit =
    status === Status.Pending ||
    !oldPassword ||
    !newPassword ||
    !match ||
    (process.env.NODE_ENV !== "development" && hasFeedback);

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setStatus(Status.Pending);
    setErrorMessage("");

    try {
      const result = await changePassword(oldPassword, newPassword);
      if (result.ok) {
        setStatus(Status.Complete);
        navigate(routes.accountList());
        return;
      }

      setStatus(Status.Failed);
      setErrorMessage(
        result.error === "bad-password"
          ? "Current password is incorrect!"
          : "Unknown error"
      );
    } catch (err) {
      setStatus(Status.Failed);
      setErrorMessage(`${err}`);
    }
  };

  return (
    <Stack
      as="form"
      gap={GapPatterns.TitleContent}
      onSubmit={handleSubmit}
      full
    >
      <PageHeader title="Change Password" />
      <Stack className="justify-center" full gap={GapPatterns.FormFields}>
        <Input
          label="Current password"
          variant="Password"
          type="password"
          value={oldPassword}
          onChange={(e) => setOldPassword(e.target.value)}
        />
        <Input
          label="New Password"
          variant="Password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          error={
            newPassword.length > 0
              ? feedback.warning || feedback.suggestions.join(" ")
              : ""
          }
        />
        <Input
          label="Confirm new password"
          variant="Password"
          value={confirmNewPassword}
          onChange={(e) => setConfirmNewPassword(e.target.value)}
          error={
            confirmNewPassword && newPassword && !match
              ? "Passwords do not match"
              : ""
          }
        />
        {errorMessage && <Alert type="error">{errorMessage}</Alert>}
      </Stack>
      <ActionButton size="lg" disabled={shouldDisableSubmit}>
        Confirm
      </ActionButton>
    </Stack>
  );
};
