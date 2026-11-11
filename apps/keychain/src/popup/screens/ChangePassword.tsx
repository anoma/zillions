/**
 * Change the vault password: verifies the current password, checks the new one
 * with zxcvbn, and re-encrypts every stored secret in the background.
 */
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import zxcvbn from "zxcvbn";

import { useVault } from "../context/VaultContext";
import routes from "../routes";
import { Button } from "../ui/Button";
import { Notice } from "../ui/Notice";
import { PasswordField } from "../ui/PasswordField";
import { ScreenHeader } from "../ui/ScreenHeader";

export const ChangePassword = () => {
  const navigate = useNavigate();
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>();
  const { changePassword } = useVault();
  const { feedback } = zxcvbn(newPassword);

  const hasFeedback =
    feedback.warning !== "" || feedback.suggestions.length > 0;
  const match = newPassword === confirmNewPassword;

  const shouldDisableSubmit =
    pending ||
    !oldPassword ||
    !newPassword ||
    !match ||
    (process.env.NODE_ENV !== "development" && hasFeedback);

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setPending(true);
    setErrorMessage(undefined);

    try {
      const result = await changePassword(oldPassword, newPassword);
      if (result.ok) {
        navigate(routes.accountList(), { replace: true });
        return;
      }
      setErrorMessage(
        result.error === "bad-password"
          ? "Current password is incorrect"
          : "Unknown error"
      );
    } catch (err) {
      setErrorMessage(`${err}`);
    }
    setPending(false);
  };

  return (
    <form className="flex flex-col flex-1" onSubmit={(e) => void handleSubmit(e)}>
      <ScreenHeader back title="Change password" />
      <div className="flex flex-col gap-4 mt-3.5">
        <PasswordField
          autoFocus
          label="Current password"
          value={oldPassword}
          onChange={(e) => setOldPassword(e.target.value)}
        />
        <PasswordField
          label="New password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          error={
            newPassword.length > 0
              ? feedback.warning || feedback.suggestions.join(" ") || undefined
              : undefined
          }
        />
        <PasswordField
          label="Confirm new password"
          value={confirmNewPassword}
          onChange={(e) => setConfirmNewPassword(e.target.value)}
          error={
            confirmNewPassword && newPassword && !match
              ? "Passwords do not match"
              : undefined
          }
        />
        {errorMessage && <Notice tone="danger">{errorMessage}</Notice>}
      </div>
      <div className="mt-auto pt-4 pb-5">
        <Button type="submit" block disabled={shouldDisableSubmit}>
          Change password
        </Button>
      </div>
    </form>
  );
};
