import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <div className="flex-1 flex flex-col justify-center items-center px-4 py-12 bg-brand-bg relative font-sans min-h-screen">
      {/* Branding Header */}
      <div className="text-center mb-8 max-w-md">
        <span className="text-xs uppercase tracking-widest text-brand-wine font-semibold bg-brand-blush/40 px-3 py-1 rounded-full">
          Hidden Honey Homes
        </span>
        <h1 className="text-3xl font-extrabold text-brand-plum tracking-tight mt-3">
          Sign In to Your Portal
        </h1>
        <p className="text-zinc-500 font-serif italic text-sm mt-2">
          Secure access for creators, partners, and administrators.
        </p>
      </div>

      {/* Clerk SignIn Component */}
      <div className="w-full max-w-md flex justify-center">
        <SignIn
          appearance={{
            elements: {
              card: "shadow-xl border border-brand-blush bg-brand-cream rounded-2xl p-6",
              headerTitle: "text-xl font-bold text-brand-plum",
              headerSubtitle: "text-xs text-zinc-500",
              formButtonPrimary: "bg-brand-plum hover:bg-brand-wine text-brand-cream text-xs uppercase tracking-wider font-bold py-2.5 rounded-lg transition-all shadow-md",
              formFieldInput: "bg-brand-bg/50 border border-brand-blush text-sm text-brand-text rounded-lg focus:border-brand-plum focus:ring-1 focus:ring-brand-plum/20",
              footerActionLink: "text-brand-plum hover:text-brand-wine font-semibold text-xs",
            }
          }}
          routing="path"
          path="/sign-in"
          signUpUrl="/sign-up"
          fallbackRedirectUrl="/partner"
        />
      </div>
    </div>
  );
}
