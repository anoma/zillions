import { v5 as uuid } from "uuid";

/** Construct a deterministic uuid (v5) from an arbitrary number of arguments. */
export const generateId = (
  namespace: string,
  ...args: (number | string)[]
): string => {
  return uuid(args.join(":"), namespace);
};
