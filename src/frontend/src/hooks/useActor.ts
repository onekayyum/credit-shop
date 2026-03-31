import { useQuery } from "@tanstack/react-query";
import type { backendInterface } from "../backend.d";
import { getLocalBackend } from "../localBackend";

const ACTOR_QUERY_KEY = "actor";

export function useActor() {
  const actorQuery = useQuery<backendInterface>({
    queryKey: [ACTOR_QUERY_KEY, "local-backend"],
    queryFn: async () => getLocalBackend(),
    staleTime: Number.POSITIVE_INFINITY,
  });

  return {
    actor: actorQuery.data || null,
    isFetching: actorQuery.isFetching,
  };
}
