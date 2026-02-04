import React from "react"
import Link from "next/link";
import { StackProvider, StackTheme } from "@stackframe/stack";
import { stackClientApp } from "../stack/client";
import { ConvexClientProvider } from "@/components/convex-client-provider";
import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { Toaster } from 'sonner'
import './fonts.css'
import './globals.css'

const _geist = Geist({ subsets: ["latin"] });
const _geistMono = Geist_Mono({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: 'Mini App Factory',
  description: 'Generate production-ready static websites from natural language descriptions',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className={`font-sans antialiased`}>
        <StackProvider app={stackClientApp}>
          <StackTheme>
            <ConvexClientProvider>
              {children}
              <footer className="border-t border-[var(--border)] bg-[var(--background)]">
                <div className="max-w-6xl mx-auto px-6 py-6 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <div className="text-[10px] font-mono uppercase tracking-widest text-[var(--muted-text)]">
                    Mini App Factory
                  </div>
                  <div className="flex flex-wrap gap-4 text-[10px] font-mono uppercase">
                    <Link href="/docs" className="text-[var(--secondary-text)] hover:text-[var(--primary)]">
                      Documentation
                    </Link>
                    <Link href="/privacy" className="text-[var(--secondary-text)] hover:text-[var(--primary)]">
                      Privacy Policy
                    </Link>
                    <Link href="/eula" className="text-[var(--secondary-text)] hover:text-[var(--primary)]">
                      EULA
                    </Link>
                    <Link href="/support" className="text-[var(--secondary-text)] hover:text-[var(--primary)]">
                      Support
                    </Link>
                  </div>
                </div>
              </footer>
              <Toaster position="bottom-right" theme="dark" />
              <Analytics />
            </ConvexClientProvider>
          </StackTheme>
        </StackProvider>
      </body>
    </html>
  )
}
