import { useMutation } from "@tanstack/react-query";
import { signup } from "../api/signup";

export const useSignup = () => {
  return useMutation({
    mutationFn: signup,
  });
};
