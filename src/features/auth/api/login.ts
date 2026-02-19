import { LoginSchemaType } from "@/lib/validators/auth";
import axios, {AxiosError} from "axios";

export async function login(data: LoginSchemaType) {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    const errorData = await res.json();
    throw new Error(errorData.error || "Failed to sign in");
  }
  const resData = await res.json();
  console.log('first res fromm auth', resData)
  return resData;
}



// export async function login(data: LoginSchemaType) {
//   try {
//     const res = await axios.post("/api/auth/login", data);
//     return res.data;
//   } catch (error) {
//     error = error instanceof AxiosError ? error.response?.data : error;
//     throw error;
//   }
// }
