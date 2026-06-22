# Social Listeting

Minimal GitHub-to-Railway smoke test with:

- `npm run start` for the Next.js frontend
- `npm run worker` for the Railway worker

## Local development

```bash
npm install
npm run dev
```

In a second terminal:

```bash
npm run worker
```

The worker responds at:

```text
http://localhost:3001/health
```

## Railway setup

1. Push this repo to GitHub.
2. In Railway, create a new project from the `elle1300/social-listeting` GitHub repo.
3. For the worker service:
   - Build command: `npm install`
   - Start command: `npm run worker`
4. For the frontend service:
   - Add another service from the same GitHub repo.
   - Build command: `npm run build`
   - Start command: `npm run start`
5. After the worker deploys, copy its Railway public URL.
6. Add this variable to the frontend service:

```text
NEXT_PUBLIC_WORKER_URL=https://your-worker-url.up.railway.app
```

Redeploy the frontend after adding the variable.
