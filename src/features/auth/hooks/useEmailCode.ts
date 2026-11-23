import { useMutation } from "@tanstack/react-query";
import { requestEmailCode, verifyEmailCode } from "../api/email-code";

export const useRequestEmailCode = () => useMutation({ mutationFn: requestEmailCode });
export const useVerifyEmailCode = () => useMutation({ mutationFn: verifyEmailCode });
