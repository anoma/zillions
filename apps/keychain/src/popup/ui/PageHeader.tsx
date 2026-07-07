/**
 * Centered page title used by every popup screen.
 */
import { Heading } from "@zillions/components";

type PageHeaderProps = {
  title: string;
};

export const PageHeader = ({ title }: PageHeaderProps) => {
  return <Heading className="text-xl text-center text-black">{title}</Heading>;
};
