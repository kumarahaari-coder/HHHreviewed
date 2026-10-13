import { Suspense } from "react";
import { SetPasswordForm } from "@/components/auth/SetPasswordForm";

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <SetPasswordForm mode="reset" />
    </Suspense>
  );
}
