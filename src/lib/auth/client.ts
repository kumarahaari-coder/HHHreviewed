/** Client-side sign-out: revokes the server session, then hard-navigates so all state resets. */
export async function signOut(options: { redirectUrl?: string } = {}): Promise<void> {
  try {
    await fetch("/api/auth/logout", { method: "POST" });
  } catch {
    // Even if the request fails, still leave the authenticated area.
  }
  window.location.href = options.redirectUrl || "/sign-in";
}
