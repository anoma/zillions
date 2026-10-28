/** Settings: security, activity, sites and appearance, then about links. */
import { useEffect, useMemo, useState } from "react";
import { GoLinkExternal, GoLock } from "react-icons/go";
import { useNavigate } from "react-router-dom";

import { createBackgroundClient } from "../../ipc/client";
import { autoLockLabel } from "../autoLock";
import { useVault } from "../context/VaultContext";
import { useTheme } from "../prefs";
import routes from "../routes";
import { Row, Section } from "../ui/Row";
import { ScreenHeader } from "../ui/ScreenHeader";
import { X_URL, ZILLIONS_SITE_URL } from "../links";
import { KEYCHAIN_VERSION, REVISION } from "../version";

/** Opens outside the Keychain; the page is the user's choice, not Keychain traffic. */
const openLink = (url: string): void => {
  window.open(url, "_blank", "noopener,noreferrer");
};

const THEME_LABEL = { system: "System", light: "Light", dark: "Dark" } as const;

export const Settings = () => {
  const navigate = useNavigate();
  const client = useMemo(() => createBackgroundClient(), []);
  const { lock } = useVault();
  const theme = useTheme();
  const [autoLock, setAutoLock] = useState<number>();
  const [sites, setSites] = useState<number>();

  useEffect(() => {
    client.autoLockMinutes().then(setAutoLock).catch(console.error);
    client
      .connectedSites()
      .then((s) => setSites(s.length))
      .catch(console.error);
  }, [client]);

  return (
    <>
      <ScreenHeader back title="Settings" />
      <Section title="Security" className="mt-1">
        <Row
          title="Auto-lock"
          subtitle={
            autoLock === undefined
              ? " "
              : autoLock === 0
                ? "Never"
                : `After ${autoLockLabel(autoLock)} idle`
          }
          onClick={() => navigate(routes.autoLock())}
        />
        <Row
          title="Change password"
          onClick={() => navigate(routes.changePassword())}
        />
        <Row
          title="Lock now"
          onClick={() => void lock()}
          trail={<GoLock className="size-4 text-muted" />}
        />
      </Section>

      <Section title="Activity" className="mt-5">
        <Row
          title="Approval log"
          subtitle="What you approved and rejected"
          onClick={() => navigate(routes.approvalLog())}
        />
        <Row
          title="Connected sites"
          subtitle={
            sites === undefined
              ? " "
              : sites === 1
                ? "1 site"
                : `${sites} sites`
          }
          onClick={() => navigate(routes.connectedSites())}
        />
      </Section>

      <Section title="Appearance" className="mt-5">
        <Row
          title="Theme"
          subtitle={THEME_LABEL[theme]}
          onClick={() => navigate(routes.theme())}
        />
      </Section>

      <Section title="About" className="mt-5">

        <Row

          title="Zillions Keychain"

          trail={

            <span className="text-[12.5px] font-medium text-muted tabular-nums">

              {KEYCHAIN_VERSION}

              {REVISION && ` · ${REVISION.substring(0, 8)}`}

            </span>

          }

        />

        <Row

          title="Help"

          onClick={() => openLink(ZILLIONS_SITE_URL)}

          trail={<GoLinkExternal className="size-3.5 text-muted" />}

        />

        <Row

          title="Zillions on X"

          onClick={() => openLink(X_URL)}

          trail={<GoLinkExternal className="size-3.5 text-muted" />}

        />

      </Section>

      <div className="shrink-0 h-6" />
    </>
  );
};
