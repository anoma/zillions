import { GoCheck } from "react-icons/go";

import { Row } from "./Row";

type ChoiceProps = {
  label: string;
  selected: boolean;
  onSelect: () => void;
  lead?: React.ReactNode;
};

/** One row of a single-choice list. */
export const Choice = ({ label, selected, onSelect, lead }: ChoiceProps) => (
  <Row
    role="radio"
    aria-checked={selected}
    className="min-h-12"
    lead={lead}
    title={label}
    onClick={onSelect}
    trail={
      <GoCheck
        className={selected ? "size-4 text-black animate-pop-in" : "size-4 invisible"}
      />
    }
  />
);
