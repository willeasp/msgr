# Deploying

Msgr runs as one container, built by the root `Dockerfile`: the API serves the built app from its own address, so one session cookie covers both, and brings the database up to date as it starts. Any host that runs a container next to a Postgres works the same way. [ADR 5](adr/0005-free-single-instance-hosting.md) explains why it's a single instance, and [manual-testing.md](manual-testing.md#9-optional-the-production-container) runs the image locally.

Ours runs on [Render](https://render.com)'s free web service, described by `render.yaml`, with the data in [Neon](https://neon.com)'s free Postgres (Render's own free database is deleted after 30 days). Both are in Frankfurt: keep the app and its database in the same region, since every query crosses between them. A Render service can't change region after it's created.

## Set it up

1. **Database.** Create a Neon project in AWS Europe Central 1 (Frankfurt) and copy its _direct_ connection string (connection pooling off); it starts with `postgresql://`. Append `&connect_timeout=15`: the database sleeps after 5 minutes without queries, and waking it takes a moment.
2. **App.** In Render, choose **New → Blueprint** and pick this repository. Paste the Neon string as `DATABASE_URL`. Render generates `JWT_SECRET`, and the app learns its own address from Render's `RENDER_EXTERNAL_URL`. Render deploys `main` once its CI checks pass. On every start the server checks for pending migrations with one query and runs them only then; until it's done, the app answers while GraphQL and `/healthz` wait, so a deploy whose migration fails never takes over.
3. **Notifications.** Generate keys once with `npx web-push generate-vapid-keys` and set them in Render as `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`. Until then Msgr runs with notifications off and says so in its log. Keep the keys: new ones mean everyone turns notifications on again.
4. **Admin page.** Set `ADMIN_EMAILS` to your own account's email (comma-separate several) and `STORAGE_LIMIT_MB` to your Neon plan's storage, e.g. `1024`. You then get **Special → Storage…**, at `/admin`: how much of the database is used and left, and what fills it (text, pictures, movies, sounds, avatars, and each table). Everyone else finds nothing at that address. The sizes are Postgres's own; Neon's console may count a little differently.
5. **First invite.** From your machine, against the production database:

   ```bash
   DATABASE_URL='<neon connection string>' CORS_ORIGIN='https://<your-app>.onrender.com' npm run invite
   ```

   Open the link, sign up, and invite everyone else from **File → Invite a Friend…**.

## The free plans

- The app sleeps after 15 minutes without visitors, and the next visit takes about a minute to wake it. An uptime monitor that calls `/healthz` every 10 minutes keeps it awake (that's all of Render's 750 free hours, on this one service). Once the server is up, `/healthz` answers from memory, so Neon still sleeps and wakes in a second. Either way the app opens at once from its own shell on the device and waits for the server, and open tabs reconnect by themselves.
- Neither plan needs a card. Without one, going over a limit suspends the service until the next month instead of billing: Render gives 750 instance hours a month (one service running all month) and a few GB of outbound traffic; Neon gives 100 compute hours and 1 GB of storage.
- The limits change; check [Render's](https://render.com/docs/free) and [Neon's](https://neon.com/pricing) pages.
