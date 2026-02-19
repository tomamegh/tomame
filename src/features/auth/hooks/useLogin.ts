import { useMutation } from "@tanstack/react-query";
import { login } from "../api/login";

export const useLogin = () => {
  return useMutation({
    mutationFn: login,
  });
};
