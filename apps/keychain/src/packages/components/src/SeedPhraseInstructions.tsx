export const SeedPhraseInstructions = () => {
  return (
    <div className="rounded-sm px-4 py-2">
      <p className="mb-6">
        <strong className="block mb-1 text-sm font-semibold">
          DO NOT share your seed phrase with ANYONE
        </strong>
        <span className="block text-[13px] font-medium leading-snug text-ink-2">
          Anyone with your seed phrase can have full control over your assets.
          Stay vigilant against phishing attacks at all times.
        </span>
      </p>
      <p className="">
        <strong className="block mb-1 text-sm font-semibold">
          Back up the phrase safely
        </strong>
        <span className="block text-[13px] font-medium leading-snug text-ink-2">
          You will never be able to restore your account without your seed
          phrase. Write it on paper; don&apos;t copy, screenshot or photograph
          it, as other apps and synced backups can read those.
        </span>
      </p>
    </div>
  );
};
