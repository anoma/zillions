import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { EnableNav } from "../components/MainNav";
import { legalEmail } from "../lib/urls";

export const Route = createFileRoute("/privacy-policy")({
  component: PrivacyPolicyRoute,
});

function PrivacyPolicyRoute() {
  return (
    <article className="p-8 pt-10 pb-20 max-sm:px-6 mx-auto max-w-160 flex flex-col gap-8 text-sm leading-relaxed">
      {/* Outside WalletProvider, which is what enables the nav on other pages. */}
      <EnableNav />
      <header className="text-center">
        <h1 className="text-lg font-semibold tracking-tight">Privacy Policy</h1>
        <p className="mt-1 text-xs text-neutral-500">
          Last updated: October 25, 2026
        </p>
      </header>

      <Section title="1. Introduction">
        <p>
          Your privacy matters to us. This web application is designed to
          respect your privacy by not collecting, storing, tracking, or sharing
          your personal information.
        </p>
      </Section>

      <Section title="2. Information We Collect">
        <p>We do not collect any personal data.</p>
        <p>
          Our application does not request, collect, or store personal
          information such as names, email addresses, IP addresses, or location
          data.
        </p>
      </Section>

      <Section title="3. Tracking and Analytics">
        <p>
          We do not track your activity or monitor how you interact with our
          application.
        </p>
        <p>Specifically, we do not:</p>
        <ul className="list-disc pl-5 flex flex-col gap-1">
          <li>Track clicks, taps, or other user interactions.</li>
          <li>Use analytics or behavioral monitoring tools.</li>
          <li>Track browsing activity or usage patterns.</li>
          <li>Use advertising trackers or profiling technologies.</li>
        </ul>
      </Section>

      <Section title="4. Cookies and Local Storage">
        <p>
          We do not use cookies or browser storage to track users, collect
          personal information, or monitor activity.
        </p>
      </Section>

      <Section title="5. Data Sharing">
        <p>
          Since we do not collect personal information, we do not sell, share,
          or transfer personal data to third parties.
        </p>
      </Section>

      <Section title="6. Third-Party Services">
        <p>
          We do not integrate third-party tracking, advertising, or analytics
          services.
        </p>
      </Section>

      <Section title="7. Data Security">
        <p>
          Our approach to data security is simple: we do not collect or retain
          user data within the application.
        </p>
      </Section>

      <Section title="8. Children's Privacy">
        <p>
          Our application does not knowingly collect personal information from
          anyone, including children.
        </p>
      </Section>

      <Section title="9. Changes to This Privacy Policy">
        <p>
          We may update this Privacy Policy occasionally to reflect changes to
          our application or legal requirements. Any updates will be published
          on this page with a revised date.
        </p>
      </Section>

      <Section title="10. Contact">
        <p>
          If you have questions about this Privacy Policy, please contact us at:{" "}
          <a
            href={`mailto:${legalEmail}`}
            className="underline hover:text-gold transition-colors"
          >
            {legalEmail}
          </a>
        </p>
      </Section>
    </article>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-semibold">{title}</h2>
      {children}
    </section>
  );
}
