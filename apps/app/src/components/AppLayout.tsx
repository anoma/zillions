import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

export function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-[200px_1fr] min-h-screen">
      <aside className="border-r border-gray-300 flex flex-col justify-between">
        <nav>
          <Link to="/">Zillions</Link>
          <ul>
            {[
              { label: "Wallet", to: "/" },
              { label: "Send", to: "/send" },
              { label: "Receive", to: "/receive" },
              { label: "Transactions", to: "/transactions" },
            ].map(({ label, to }) => (
              <li key={to}>
                <Link to={to} className="hover:text-gold transition-all">
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <footer>FOOTER</footer>
      </aside>
      <div>
        <header className="h-20 border-b border-gray-300">HEADER</header>
        <main>{children}</main>
      </div>
    </div>
  );
}
