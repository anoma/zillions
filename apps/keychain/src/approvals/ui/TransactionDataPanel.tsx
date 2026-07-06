/**
 * Raw PCZT JSON view (the "View Data" toggle).
 */
type TransactionDataPanelProps = {
  data: string;
};

export const TransactionDataPanel = ({
  data,
}: TransactionDataPanelProps): JSX.Element => {
  return (
    <div className="flex flex-col flex-1 border border-neutral-500 rounded-sm px-4 py-4 overflow-auto">
      <pre>{data}</pre>
    </div>
  );
};
