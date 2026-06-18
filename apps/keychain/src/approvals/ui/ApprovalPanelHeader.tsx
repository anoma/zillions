/**
 * Header above a transaction summary: message count + raw-data view toggle.
 */
import { FaCode, FaTimes } from "react-icons/fa";

type ApprovalPanelHeaderProps = {
  numberOfTransactions: number;
  viewTransactionData: boolean;
  onChangeViewData: (display: boolean) => void;
};

export const ApprovalPanelHeader = ({
  numberOfTransactions,
  viewTransactionData: displayTransaction,
  onChangeViewData,
}: ApprovalPanelHeaderProps): JSX.Element => {
  return (
    <header className="flex w-full items-center justify-between text-sm mb-2">
      <div>
        <i className="font-bold not-italic">{numberOfTransactions}</i>{" "}
        {numberOfTransactions === 1 ? "Message" : "Messages"}
      </div>
      <button
        className="flex cursor-pointer items-center gap-1 hover:text-neutral-hover"
        onClick={() => onChangeViewData(!displayTransaction)}
      >
        {displayTransaction ?
          <>
            Hide Data <FaTimes />
          </>
          : <>
            View Data <FaCode />
          </>
        }
      </button>
    </header>
  );
};
