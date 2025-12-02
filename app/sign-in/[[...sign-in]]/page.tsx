"use client"

import { useState } from "react"
import { useSignIn } from "@clerk/nextjs"
import { useRouter } from "next/navigation"
import { FileText, Mail, Lock, Eye, EyeOff, ArrowRight, Shield, CheckCircle } from "lucide-react"
import Link from "next/link"

export default function SignInPage() {
  const { signIn, isLoaded, setActive } = useSignIn()
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isLoaded || !signIn) return

    setIsLoading(true)
    setError("")

    try {
      const result = await signIn.create({
        identifier: email,
        password,
      })

      if (result.status === "complete") {
        await setActive({ session: result.createdSessionId })
        router.push("/deals")
      }
    } catch (err: unknown) {
      const clerkError = err as { errors?: { message: string }[] }
      setError(clerkError.errors?.[0]?.message || "Invalid email or password")
    } finally {
      setIsLoading(false)
    }
  }

  const handleOAuthSignIn = async (provider: "oauth_google" | "oauth_microsoft") => {
    if (!isLoaded || !signIn) return

    try {
      await signIn.authenticateWithRedirect({
        strategy: provider,
        redirectUrl: "/sign-in/sso-callback",
        redirectUrlComplete: "/deals",
      })
    } catch (err) {
      console.error("OAuth error:", err)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0a0f] overflow-hidden relative">
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
      <div className="fixed top-[-100px] left-[-100px] w-[400px] h-[400px] bg-indigo-500 rounded-full blur-[80px] opacity-50 animate-float" />
      <div className="fixed bottom-[-50px] right-[-50px] w-[300px] h-[300px] bg-cyan-500 rounded-full blur-[80px] opacity-50 animate-float-delayed" />
      <div className="fixed top-1/2 right-[20%] w-[200px] h-[200px] bg-violet-500 rounded-full blur-[80px] opacity-50 animate-float-slow" />

      <div className="relative z-10 w-full max-w-[480px] px-5">
        {/* Login card */}
        <div
          className="backdrop-blur-[40px] border border-white/[0.08] rounded-3xl p-12 shadow-2xl animate-card-entry"
          style={{
            background: "rgba(255, 255, 255, 0.03)",
            boxShadow: `
              0 0 0 1px rgba(255, 255, 255, 0.05) inset,
              0 25px 50px -12px rgba(0, 0, 0, 0.5),
              0 0 100px rgba(99, 102, 241, 0.1)
            `,
          }}
        >
          {/* Logo */}
          <div className="text-center mb-10">
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

          {/* Form */}
          <form onSubmit={handleSubmit}>
            {error && (
              <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                {error}
              </div>
            )}

            {/* Email */}
            <div className="mb-6">
              <label className="block text-white/60 text-[13px] font-medium mb-2.5 tracking-wide">
                Email Address
              </label>
              <div className="relative">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  required
                  className="w-full py-4 pl-[52px] pr-4 bg-white/[0.03] border border-white/[0.08] rounded-[14px] text-white text-[15px] placeholder:text-white/40 outline-none transition-all duration-300 hover:border-white/[0.15] hover:bg-white/[0.05] focus:border-indigo-500 focus:bg-indigo-500/[0.05] focus:ring-4 focus:ring-indigo-500/10"
                />
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40 pointer-events-none" />
              </div>
            </div>

            {/* Password */}
            <div className="mb-6">
              <label className="block text-white/60 text-[13px] font-medium mb-2.5 tracking-wide">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                  className="w-full py-4 pl-[52px] pr-12 bg-white/[0.03] border border-white/[0.08] rounded-[14px] text-white text-[15px] placeholder:text-white/40 outline-none transition-all duration-300 hover:border-white/[0.15] hover:bg-white/[0.05] focus:border-indigo-500 focus:bg-indigo-500/[0.05] focus:ring-4 focus:ring-indigo-500/10"
                />
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40 pointer-events-none" />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/60 transition-colors p-1"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {/* Remember me & Forgot password */}
            <div className="flex items-center justify-between mb-8">
              <label className="flex items-center gap-2.5 cursor-pointer group">
                <div className="relative">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="sr-only"
                  />
                  <div className={`w-5 h-5 rounded-md border transition-all duration-300 flex items-center justify-center ${
                    rememberMe
                      ? "bg-indigo-500 border-indigo-500"
                      : "bg-white/[0.03] border-white/[0.08] group-hover:border-white/[0.15]"
                  }`}>
                    {rememberMe && <CheckCircle className="w-3 h-3 text-white" />}
                  </div>
                </div>
                <span className="text-white/60 text-sm">Remember me</span>
              </label>
              <Link href="/forgot-password" className="text-indigo-400 text-sm font-medium hover:text-indigo-300 transition-colors">
                Forgot password?
              </Link>
            </div>

            {/* Submit button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-[18px] px-6 rounded-[14px] text-white text-base font-semibold relative overflow-hidden transition-all duration-300 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-70 disabled:cursor-not-allowed group"
              style={{
                background: "linear-gradient(135deg, #6366f1, #4f46e5)",
                boxShadow: "0 8px 24px rgba(99, 102, 241, 0.25)",
              }}
            >
              <div className="absolute inset-0 bg-gradient-to-br from-white/[0.15] to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <span className="relative z-10 flex items-center justify-center gap-2.5">
                {isLoading ? (
                  <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    Sign In
                    <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </span>
            </button>
          </form>

          {/* Divider */}
          <div className="flex items-center gap-4 my-8">
            <div className="flex-1 h-px bg-white/[0.08]" />
            <span className="text-white/40 text-[13px] font-medium">or continue with</span>
            <div className="flex-1 h-px bg-white/[0.08]" />
          </div>

          {/* SSO buttons */}
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => handleOAuthSignIn("oauth_google")}
              className="py-3.5 px-5 bg-white/[0.03] border border-white/[0.08] rounded-xl text-white text-sm font-medium flex items-center justify-center gap-2.5 transition-all duration-300 hover:bg-white/[0.06] hover:border-white/[0.15] hover:-translate-y-0.5"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Google
            </button>
            <button
              type="button"
              onClick={() => handleOAuthSignIn("oauth_microsoft")}
              className="py-3.5 px-5 bg-white/[0.03] border border-white/[0.08] rounded-xl text-white text-sm font-medium flex items-center justify-center gap-2.5 transition-all duration-300 hover:bg-white/[0.06] hover:border-white/[0.15] hover:-translate-y-0.5"
            >
              <svg className="w-5 h-5" viewBox="0 0 23 23">
                <path fill="#f35325" d="M1 1h10v10H1z"/>
                <path fill="#81bc06" d="M12 1h10v10H12z"/>
                <path fill="#05a6f0" d="M1 12h10v10H1z"/>
                <path fill="#ffba08" d="M12 12h10v10H12z"/>
              </svg>
              Microsoft
            </button>
          </div>

          {/* Footer */}
          <div className="text-center mt-8 pt-6 border-t border-white/[0.08]">
            <p className="text-white/40 text-sm">
              Don&apos;t have an account?{" "}
              <Link href="/sign-up" className="text-indigo-400 font-semibold hover:text-indigo-300 transition-colors">
                Request Access
              </Link>
            </p>
          </div>
        </div>

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

      <style jsx>{`
        @keyframes float {
          0%, 100% { transform: translate(0, 0) scale(1); }
          25% { transform: translate(30px, -30px) scale(1.05); }
          50% { transform: translate(-20px, 20px) scale(0.95); }
          75% { transform: translate(20px, 30px) scale(1.02); }
        }
        .animate-float { animation: float 25s ease-in-out infinite; }
        .animate-float-delayed { animation: float 25s ease-in-out infinite; animation-delay: -10s; }
        .animate-float-slow { animation: float 25s ease-in-out infinite; animation-delay: -5s; }

        @keyframes cardEntry {
          from { opacity: 0; transform: translateY(30px) scale(0.96); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .animate-card-entry { animation: cardEntry 0.8s cubic-bezier(0.16, 1, 0.3, 1); }
      `}</style>
    </div>
  )
}
