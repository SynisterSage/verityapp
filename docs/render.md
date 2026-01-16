## Deploying on Render

Render is our recommended production host because it keeps your API and background services live all the time, which is critical for Twilio webhooks and the real-time call flows SafeCall depends on. The $19/month **Professional Web Service** gives us:

| Feature | Benefit |
| --- | --- |
| 24/7 uptime (no autosleep) | Twilio webhooks never hit a cold start; your polling loops stay active. |
| 1 vCPU / 2 GB RAM + 10 GB disk | More than enough for the current Express/ts-node backend and fraud scoring logic. |
| 500 GB bandwidth | Covers moderate call traffic and Supabase/SMS delivery without extra charges. |
| Autoscaling hooks + replicate button | Easy to add replicas or workers when CPU / RAM gets tight. |
| Preview/isolation & private links | Test staging builds before routing production webhooks to them. |
| Auto TLS + custom domains | Swap the ngrok URL for `https://api.verityprotect.com` (or whatever you point to). |

### How we integrate with Render

1. Push the backend repo to GitHub; Render builds it using `npm run build` / `npm run start` (see `backend/package.json`).
2. Create a Professional Web Service that points to the repo and the `/ backend` directory. Use the existing `.env` backend vars, but update `PUBLIC_API_URL` (and the Twilio webhook URLs) to point to the Render domain.
3. Update Supabase/Twilio webhooks to the new HTTPS endpoint so that ngrok (used in development) is replaced by the Render production URL.
4. Keep any polling loops or cron tasks inside separate worker services if they start consuming >60% CPU. Render workers are priced the same; you just create another service and route only the heavy polling/transcription jobs there.

### Replacing ngrok

| Development | Production |
| --- | --- |
| `https://XXXX.ngrok.app/api/v1/...` (tunneled to local Express) | `https://your-service.onrender.com/api/v1/...` |
| Local SIGINT, debugger, hot reload | Render handles build + TLS; rerun `npm run dev` locally for development. |
| Twilio/Supabase webhook URLs pointed to ngrok | Switch them to Render’s stable domain once you deploy |

### Scaling guidance

- **CPU / RAM spikes**: Monitor the Render dashboard. If CPU stays above ~70% or memory heads toward 2 GB, add another replica (same plan) for horizontal scaling. This simply multiplies your web service handlers without code changes.
- **Heavy polling or transcription jobs**: Keep the main API focused on Twilio/Supabase requests. Any long-running background tasks (e.g., streaming audio into Microsoft’s speech SDK or scoring fraud rules every few seconds) can live in a dedicated worker service; start it on the same $19 plan and route the job queue there.
- **Bandwidth concerns**: 500 GB is plenty for early members. If you hit the limit, Render alerts you; at that point you can either enable a second service or bump to the next tier.

### Summary

Render’s paid service gives you predictable uptime, auto TLS, and autoscaling, so your Twilio-backed features stay reliable. ngrok remains the dev/testing tunnel—once you deploy on Render, just update your webhook URLs and you’re on a production-grade endpoint with no cold starts or credit-based usage.
