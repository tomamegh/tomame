"use client";
import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "./ui/button";

function NotFoundButton() {
  const router = useRouter();
  return (
    <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
      <Button variant={'outline'}
        onClick={()=>router.back()}
      >
        Back
      </Button>
      <Link
        href="/"
        className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-2 rounded-xl bg-linear-to-r from-rose-500 via-orange-500 to-amber-500 text-white text-sm font-semibold shadow-sm hover:opacity-90 active:scale-[.98] transition-all"
      >
        Go to homepage
      </Link>
    </div>
  );
}

export default NotFoundButton;
