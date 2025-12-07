import { SignUp } from "@clerk/nextjs"
import { FileText, Shield, Lock, CheckCircle } from "lucide-react"

export default function SignUpPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0a0f] overflow-hidden relative py-12">
      {/* Animated background gradient */}
      <div
        className="fixed inset-0 animate-pulse"
        style={{
          background: `
            radial-gradient(ellipse 80% 50% at 20% 40%, rgba(99, 102, 241, 0.15) 0%, transparent 50%),
            radial-gradient(ellipse 60% 40% at 80% 60%, rgba(6, 182, 212, 0.1) 0%, transparent 50%),
            radial-gradient(ellipse 40% 30% at 50% 80%, rgba(139, 92, 246, 0.08) 0%, transparent 50%)
          `,
          animationDuration: "20s",
        }}
      />

      {/* Grid pattern */}
      <div
        className="fixed inset-0"
        style={{
          backgroundImage: `
            linear-gradient(rgba(255, 255, 255, 0.02) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255, 255, 255, 0.02) 1px, transparent 1px)
          `,
          backgroundSize: "60px 60px",
          maskImage: "radial-gradient(ellipse 50% 50% at 50% 50%, black, transparent)",
        }}
      />

      {/* Floating orbs */}
      <div className="fixed top-[-100px] left-[-100px] w-[400px] h-[400px] bg-indigo-500 rounded-full blur-[80px] opacity-50" />
      <div className="fixed bottom-[-50px] right-[-50px] w-[300px] h-[300px] bg-cyan-500 rounded-full blur-[80px] opacity-50" />
      <div className="fixed top-1/2 right-[20%] w-[200px] h-[200px] bg-violet-500 rounded-full blur-[80px] opacity-50" />

      <div className="relative z-10 w-full max-w-[480px] px-5">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-3 mb-4">
            <div
              className="w-12 h-12 rounded-[14px] flex items-center justify-center relative overflow-hidden"
              style={{
                background: "linear-gradient(135deg, #6366f1, #06b6d4)",
                boxShadow: "0 8px 24px rgba(99, 102, 241, 0.3)",
              }}
            >
              <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent" />
              <FileText className="w-7 h-7 text-white relative z-10" />
            </div>
            <span
              className="text-[26px] font-bold tracking-tight"
              style={{
                background: "linear-gradient(135deg, #ffffff, rgba(255, 255, 255, 0.6))",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              ContractBuddy
            </span>
          </div>
          <p className="text-white/60 text-sm tracking-wide">AI-Powered Contract Intelligence</p>
        </div>

        {/* Clerk SignUp Component */}
        <SignUp
          appearance={{
            elements: {
              rootBox: "mx-auto",
              card: "bg-white/[0.03] backdrop-blur-[40px] border border-white/[0.08] shadow-2xl",
              headerTitle: "text-white",
              headerSubtitle: "text-white/60",
              socialButtonsBlockButton: "bg-white/[0.03] border border-white/[0.08] text-white hover:bg-white/[0.06]",
              socialButtonsBlockButtonText: "text-white font-medium",
              dividerLine: "bg-white/[0.08]",
              dividerText: "text-white/40",
              formFieldLabel: "text-white/60",
              formFieldInput: "bg-white/[0.03] border-white/[0.08] text-white placeholder:text-white/40",
              formButtonPrimary: "bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700",
              footerActionLink: "text-indigo-400 hover:text-indigo-300",
              identityPreviewText: "text-white",
              identityPreviewEditButton: "text-indigo-400",
            },
          }}
          forceRedirectUrl="/"
        />

        {/* Trust badges */}
        <div className="flex items-center justify-center gap-6 mt-8 opacity-60">
          <div className="flex items-center gap-1.5 text-white/40 text-xs">
            <Shield className="w-3.5 h-3.5" />
            <span>SOC2 Compliant</span>
          </div>
          <div className="flex items-center gap-1.5 text-white/40 text-xs">
            <Lock className="w-3.5 h-3.5" />
            <span>256-bit Encryption</span>
          </div>
          <div className="flex items-center gap-1.5 text-white/40 text-xs">
            <CheckCircle className="w-3.5 h-3.5" />
            <span>GDPR Ready</span>
          </div>
        </div>
      </div>
    </div>
  )
}
