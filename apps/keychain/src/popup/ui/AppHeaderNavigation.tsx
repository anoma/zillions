/**
 * Slide-in settings drawer, opened from the header's gear icon.
 */
import clsx from "clsx";
import { FaDiscord, FaXTwitter } from "react-icons/fa6";
import { GoLinkExternal, GoQuestion } from "react-icons/go";
import { useNavigate } from "react-router-dom";

import { Stack } from "@zillions/components";

import extensionPackage from "../../../package.json";
import { useVault } from "../context/VaultContext";
import routes from "../routes";

const { Z_INTERFACE_REVISION: revision = "" } = process.env;

type AppHeaderNavigationProps = {
  open: boolean;
  onClose: () => void;
};

export const AppHeaderNavigation = ({
  open,
  onClose,
}: AppHeaderNavigationProps): JSX.Element => {
  const { lock } = useVault();
  const navigate = useNavigate();

  const onClick = (e: React.MouseEvent): void => {
    e.stopPropagation();
    onClose();
  };

  const goTo = (callback: () => string): void => {
    navigate(callback());
    onClose();
  };

  const onLock = async (): Promise<void> => {
    await lock();
    onClose();
  };

  const listItemClassList = clsx(
    "relative cursor-pointer text-black transition-colors duration-100",
    "ease-out hover:text-neutral-500 active:top-px"
  );

  return (
    <>
      <nav
        className={clsx(
          "bg-neutral text-black h-full fixed pt-16 px-6 pb-8 right-0 top-0",
          "transition-all duration-[600ms] w-[65%] z-50 translate-x-full ease-out-expo",
          { "!translate-x-0": open }
        )}
      >
        <i
          className={clsx(
            "text-[1.85em] cursor-pointer leading-[0] absolute right-0 px-5 py-8 not-italic",
            "top-0 transition-colors duration-100 ease-out select-none hover:text-neutral-500 active:top-px"
          )}
          role="button"
          aria-label="Close menu"
          onClick={onClick}
        >
          &#x2715;
        </i>
        <div className="flex flex-col flex-1 h-full justify-between">
          <Stack gap={4} as="ul" className="text-xl select-none">
            <li
              className={listItemClassList}
              onClick={() => goTo(routes.changePassword)}
            >
              Change Password
            </li>
            <li
              className={listItemClassList}
              onClick={() => goTo(routes.connectedSites)}
            >
              Connected Sites
            </li>
            <li className={listItemClassList} onClick={() => void onLock()}>
              Lock Wallet
            </li>
          </Stack>
          <div className="relative h-full">
            <Stack
              as="ul"
              gap={1}
              direction="vertical"
              className="absolute bottom-4"
            >
              <li>
                Keychain Version: <strong>{extensionPackage.version}</strong>
              </li>
              {revision && (
                <li>
                  <span>Revision: </span>
                  <a
                    href={`https://github.com/zillions/zillions-interface/commit/${revision}`}
                    target="_blank"
                    rel="noreferrer"
                    className="font-bold hover:underline"
                  >
                    {revision.substring(0, 8)}{" "}
                    <GoLinkExternal className="inline h-2.5 w-2.5" />
                  </a>
                </li>
              )}
            </Stack>
          </div>
          <footer className="flex items-center justify-between text-black text-2xl">
            <Stack
              as="ul"
              gap={4}
              direction="horizontal"
              className="items-center"
            >
              <a
                href="https://discord.com/invite/zillions"
                target="_blank"
                className="transition-colors text-[1.15em] hover:text-neutral-500"
                rel="noreferrer nofollow"
              >
                <FaDiscord />
              </a>
              <a
                href="https://twitter.com/zillions"
                target="_blank"
                className="transition-colors hover:text-neutral-500"
                rel="noreferrer nofollow"
              >
                <FaXTwitter />
              </a>
            </Stack>
            <Stack
              as="ul"
              gap={4}
              direction="horizontal"
              className="items-center"
            >
              <a
                href="https://discord.com/channels/833618405537218590/1074984397599678534"
                target="_blank"
                className="transition-colors hover:text-neutral-500"
                rel="noreferrer nofollow"
              >
                <GoQuestion />
              </a>
            </Stack>
          </footer>
        </div>
      </nav>
      {open && (
        <div
          className={clsx(
            "animate-fade-in bg-black/50 cursor-pointer h-full",
            "left-0 fixed top-0 w-full z-40 last:self-end"
          )}
          onClick={onClick}
        />
      )}
    </>
  );
};
