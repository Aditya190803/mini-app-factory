type LogoutUser = {
  signOut: () => Promise<void> | void;
};

export async function logout(user: LogoutUser, redirectTo = "/") {
  if (typeof window !== "undefined") {
    const returnTo = encodeURIComponent(redirectTo);
    window.location.href = `/handler/sign-out?returnTo=${returnTo}`;
    return;
  }
  await user.signOut();
}
