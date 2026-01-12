import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

// Public routes that don't require authentication
const isPublicRoute = createRouteMatcher([
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/api/webhooks(.*)',
  '/changelog',
])

// Bypass auth for E2E testing
const isE2ETesting = process.env.E2E_TESTING === 'true' || process.env.PLAYWRIGHT_TEST === 'true'

export default clerkMiddleware(async (auth, req) => {
  // In E2E testing mode, bypass authentication
  if (isE2ETesting) {
    return NextResponse.next()
  }

  // Skip auth check for public routes
  if (isPublicRoute(req)) {
    return NextResponse.next()
  }

  // For all other routes, require authentication
  const { userId } = await auth()

  if (!userId) {
    // Redirect unauthenticated users to sign-in page
    const signInUrl = new URL('/sign-in', req.url)
    signInUrl.searchParams.set('redirect_url', req.url)
    return NextResponse.redirect(signInUrl)
  }
})

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
}
