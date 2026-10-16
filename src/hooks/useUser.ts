import { useAuth } from "@/hooks/use-auth";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";

export function useUser() {
  const { user } = useAuth();
  const clearConversation = useMutation(api.felicia.clearConversation);

  return {
    user,
    billingAccount: null as null,
    logout: useAuth().signOut,
    clearConversation,
  };
}
