/**
 * Password + confirmation fields with zxcvbn strength feedback, reported via
 * `onValidPassword`. Production requires no zxcvbn warnings/suggestions and a
 * matching confirmation; development relaxes this to "non-empty + matches".
 */
import { Input } from "@zillions/components";
import { useEffect, useState } from "react";
import zxcvbn from "zxcvbn";

type Props = {
  onValidPassword: (password: string | undefined) => void;
  "data-testid"?: string;
};

const isValid = (
  { warning, suggestions }: zxcvbn.ZXCVBNFeedback,
  password: string,
  confirm: string
): boolean =>
  process.env.NODE_ENV === "development"
    ? password.length > 0 && password === confirm
    : warning === "" && suggestions.length === 0 && password === confirm;

export const PasswordFields = ({
  onValidPassword,
  "data-testid": dataTestId,
}: Props): JSX.Element => {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [feedback, setFeedback] = useState(zxcvbn("").feedback);

  useEffect(() => {
    onValidPassword(isValid(feedback, password, confirm) ? password : undefined);
  }, [password, confirm, feedback, onValidPassword]);

  const checkStrength = (value: string): void => {
    setFeedback(zxcvbn(value).feedback);
  };

  const strengthError =
    feedback.warning ||
    (feedback.suggestions.length > 0 &&
      feedback.suggestions.map((s, i) => <div key={`pw-hint-${i}`}>{s}</div>));

  const mismatch = confirm !== "" && password !== confirm;

  return (
    <>
      <Input
        data-testid={dataTestId}
        label="Create Extension Password"
        variant="Password"
        value={password}
        placeholder="At least 8 characters"
        error={password.length > 0 ? strengthError : ""}
        onChange={(e) => {
          setPassword(e.target.value);
          checkStrength(e.target.value);
        }}
        onBlur={() => checkStrength(password)}
      />
      <Input
        label="Confirm Extension Password"
        placeholder="At least 8 characters"
        variant="Password"
        value={confirm}
        error={mismatch ? "Passwords are not matching" : ""}
        onChange={(e) => setConfirm(e.target.value)}
      />
    </>
  );
};
