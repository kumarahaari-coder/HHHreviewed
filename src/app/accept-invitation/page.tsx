import { Suspense } from "react";
import { SetPasswordForm } from "@/components/auth/SetPasswordForm";

export default function AcceptInvitationPage() {
  return (
    <Suspense>
      <SetPasswordForm mode="invite" />
    </Suspense>
  );
}
