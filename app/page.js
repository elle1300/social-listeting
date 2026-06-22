const workerUrl = process.env.NEXT_PUBLIC_WORKER_URL;

export default function Home() {
  return (
    <main className="shell">
      <section className="panel">
        <p className="eyebrow">Railway smoke test</p>
        <h1>Social Listeting</h1>
        <p className="lede">
          The frontend is live. The worker has a tiny health endpoint ready for
          Railway.
        </p>

        <div className="statusGrid" aria-label="Deployment status">
          <div>
            <span>Frontend</span>
            <strong>Next.js</strong>
          </div>
          <div>
            <span>Worker</span>
            <strong>{workerUrl ? "Configured" : "Waiting for URL"}</strong>
          </div>
        </div>

        {workerUrl ? (
          <a className="button" href={`${workerUrl.replace(/\/$/, "")}/health`}>
            Open worker health
          </a>
        ) : (
          <p className="note">
            Add NEXT_PUBLIC_WORKER_URL after the worker deploys to link this
            button to Railway.
          </p>
        )}
      </section>
    </main>
  );
}
