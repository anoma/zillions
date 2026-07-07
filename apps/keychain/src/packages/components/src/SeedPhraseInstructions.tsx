export const SeedPhraseInstructions = () => {
  return (
    <div className="rounded-sm px-4 py-2">
      <p className="mb-6">
        <strong className="block mb-1 text-sm">
          DO NOT share your seed phrase with ANYONE
        </strong>
        <span className="block text-[13px] font-medium leading-4 text-black">
          Anyone with your seed phrase can have full control over your assets.
          Stay vigilant against phishing attacks at all times.
        </span>
      </p>
      <p className="">
        <strong className="block mb-1 text-sm">
          Back up the phrase safely
        </strong>
        <span className="block text-[13px] font-medium leading-4 text-black">
          You will never be able to restore your account without your seed
          phrase.
        </span>
      </p>
    </div>
  );
};
