export default function Home() {
  return (
    <main className="space-y-6">
      <h1 className="text-2xl font-semibold">Smartcar Webhook Receiver</h1>
      <p className="text-gray-700">
        This Vercel-hosted Next.js app receives Smartcar webhooks, verifies signatures,
        persists raw and normalized data in Postgres, and exposes APIs for analytics.
      </p>
      <ul className="list-disc pl-6 text-gray-800">
        <li>POST <code>/api/webhook</code> — receive and store events</li>
        <li>GET <code>/api/events</code> — list recent events</li>
        <li>GET <code>/api/signals</code> — query flattened signals</li>
      </ul>
    </main>
  )
}


