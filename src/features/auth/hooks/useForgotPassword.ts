import { useMutation } from "@tanstack/react-query";
import { forgotPassword } from "../api/forgot-password";

export const useForgotPassword = () => {
  return useMutation({
    mutationFn: forgotPassword,
  });
};
