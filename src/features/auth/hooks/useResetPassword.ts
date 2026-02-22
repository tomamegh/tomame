import { useMutation } from "@tanstack/react-query";
import { resetPassword } from "../api/reset-password";

export const useResetPassword = () => {
  return useMutation({
    mutationFn: resetPassword,
  });
};
