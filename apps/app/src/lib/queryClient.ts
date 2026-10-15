import { QueryClient } from "@tanstack/react-query";

/** The app's query cache; outside React too, for data the wallet fetches on its own. */
export const queryClient = new QueryClient();
