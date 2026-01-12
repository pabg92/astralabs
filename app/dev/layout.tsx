import Link from "next/link"
import { AlertTriangle } from "lucide-react"

export default function DevLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Server-side check for dev routes
  const isEnabled = process.env.ENABLE_DEV_ROUTES === 'true'

  if (!isEnabled) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white flex items-center justify-center p-6">
        <div className="max-w-md text-center">
          <AlertTriangle className="h-16 w-16 text-amber-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Dev Routes Not Enabled</h1>
          <p className="text-slate-600 mb-6">
            These development testing routes require the <code className="px-1.5 py-0.5 bg-slate-100 rounded text-sm">ENABLE_DEV_ROUTES=true</code> environment variable to be set.
          </p>
          <div className="text-left bg-slate-50 border rounded-lg p-4 mb-6">
            <p className="text-sm font-medium text-slate-700 mb-2">To enable:</p>
            <ol className="text-sm text-slate-600 space-y-1 list-decimal list-inside">
              <li>Go to Vercel Project Settings</li>
              <li>Navigate to Environment Variables</li>
              <li>Add: <code className="bg-slate-200 px-1 rounded">ENABLE_DEV_ROUTES</code> = <code className="bg-slate-200 px-1 rounded">true</code></li>
              <li>Select Preview/Development environments</li>
              <li>Redeploy the project</li>
            </ol>
          </div>
          <Link
            href="/"
            className="text-blue-600 hover:underline text-sm"
          >
            Return to App
          </Link>
        </div>
      </div>
    )
  }

  return children
}
