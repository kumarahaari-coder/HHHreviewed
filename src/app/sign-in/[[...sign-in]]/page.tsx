import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <div className="flex-1 flex flex-col justify-center items-center px-4 py-12 bg-canvas relative font-sans min-h-screen">
      {/* Branding Header */}
      <div className="text-center mb-8 max-w-md">
        <span className="text-xs uppercase tracking-widest text-secondary font-semibold bg-surface border border-divider-soft px-3 py-1 rounded-full">
          Hidden Honey Homes
        </span>
        <h1 className="text-3xl font-bold text-primary tracking-tight mt-3">
          Partner & Creator Portal
        </h1>
        <p className="text-secondary text-sm mt-2 font-normal">
          Secure sign in for approved creators, partners, and administrators.
        </p>
      </div>

      {/* Clerk SignIn Component (Sign up disabled, redirects strictly to /auth/resolve) */}
      <div className="w-full max-w-md flex justify-center">
        <SignIn
          appearance={{
            elements: {
              card: "shadow-sm border border-divider-soft bg-surface rounded-2xl p-6 font-sans",
              headerTitle: "text-xl font-bold text-primary font-sans",
              headerSubtitle: "text-xs text-secondary font-sans",
              formButtonPrimary: "bg-primary hover:bg-primary/90 text-surface text-xs uppercase tracking-wider font-bold py-2.5 rounded-lg transition-all shadow-xs font-sans",
              formFieldInput: "bg-surface-subtle border border-divider-soft text-sm text-primary rounded-lg focus:border-primary focus:ring-1 focus:ring-primary/20 font-sans"
            }
          }}
          routing="path"
          path="/sign-in"
          signUpUrl={null as any}
          fallbackRedirectUrl="/auth/resolve"
          forceRedirectUrl="/auth/resolve"
        />
      </div>
    </div>
  );
}
