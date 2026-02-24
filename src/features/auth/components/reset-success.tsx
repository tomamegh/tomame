"use client";
import { useSearchParams } from "next/navigation";
import React from "react";

function ResetSuccess() {
  const searchParams = useSearchParams();
  const resetSuccess = searchParams.get("reset") === "success";
  return (
    <>
      {resetSuccess && (
        <div className="p-3 bg-green-50 border border-green-200 rounded-xl text-green-700 text-sm">
          Password reset successfully. Sign in with your new password.
        </div>
      )}
    </>
  );
}

export default ResetSuccess;
