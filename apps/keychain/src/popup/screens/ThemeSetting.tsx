/** Theme: follow the system, or always light or dark. */
import { GoDeviceDesktop, GoMoon, GoSun } from "react-icons/go";

import { setTheme, type Theme, useTheme } from "../prefs";
import { Choice } from "../ui/Choice";
import { ScreenHeader } from "../ui/ScreenHeader";

const OPTIONS: { value: Theme; label: string; icon: React.ReactNode }[] = [
  { value: "system", label: "System", icon: <GoDeviceDesktop /> },
  { value: "light", label: "Light", icon: <GoSun /> },
  { value: "dark", label: "Dark", icon: <GoMoon /> },
];

export const ThemeSetting = () => {
  const theme = useTheme();
  return (
    <>
      <ScreenHeader back title="Theme" />
      <div role="radiogroup" aria-label="Theme" className="mt-2">
        {OPTIONS.map(({ value, label, icon }) => (
          <Choice
            key={value}
            label={label}
            selected={theme === value}
            onSelect={() => setTheme(value)}
            lead={<span className="size-8 grid place-items-center text-ink-2 [&_svg]:size-4">{icon}</span>}
          />
        ))}
      </div>
    </>
  );
};
