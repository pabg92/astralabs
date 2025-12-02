import type React from "react"
import type { Metadata } from "next"
import { Inter, Geist_Mono } from "next/font/google"
import { Analytics } from "@vercel/analytics/next"
import {
  ClerkProvider,
  SignedIn,
  UserButton,
} from "@clerk/nextjs"
import Link from "next/link"
import "./globals.css"

const _inter = Inter({ subsets: ["latin"] })
const _geistMono = Geist_Mono({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "Contract Reconciliation Workspace",
  description: "Legal ops contract review and reconciliation platform",
  generator: "v0.app",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <ClerkProvider
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      afterSignOutUrl="/"
    >
      <html lang="en">
        <body className={`font-sans antialiased`}>
          <SignedIn>
            <header className="fixed top-4 right-4 z-50 flex items-center gap-3">
              <Link
                href="/deals"
                className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
              >
                Deals
              </Link>
              <UserButton
                afterSignOutUrl="/"
                appearance={{
                  elements: {
                    avatarBox: "w-9 h-9",
                  },
                }}
              />
            </header>
          </SignedIn>
          {children}
          <Analytics />
        </body>
      </html>
    </ClerkProvider>
  )
}
