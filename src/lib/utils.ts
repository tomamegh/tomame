import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}


export function getApiKey(key:string): string {
  const apiKey = process.env[key];
  if (!apiKey) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return apiKey;
}