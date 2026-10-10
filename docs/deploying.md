# Deploying

Msgr runs as one container, built by the root `Dockerfile`: it migrates the database on start, then the API serves the built app from its own address, so one session cookie covers both. Any host that runs a container next to a Postgres works the same way. [ADR 5](adr/0005-free-single-instance-hosting.md) explains why it's a single instance, and [manual-testing.md](manual-testing.md#9-optional-the-production-container) runs the image locally.

Ours runs on [Render](https://render.com)'s free web service, described by `render.yaml`, with the data in [Neon](https://neon.com)'s free Postgres (Render's own free database is deleted after 30 days). Both are in Frankfurt: keep the app and its database in the same region, since every query crosses between them. A Render service can't change region after it's created.

## Set it up

1. **Database.** Create a Neon project in AWS Europe Central 1 (Frankfurt) and copy its _direct_ connection string (connection pooling off); it starts with `postgresql://`. Append `&connect_timeout=15`: the database sleeps after 5 minutes without queries, and waking it takes a moment.
2. **App.** In Render, choose **New → Blueprint** and pick this repository. Paste the Neon string as `DATABASE_URL`. Render generates `JWT_SECRET`, and the app learns its own address from Render's `RENDER_EXTERNAL_URL`. Render deploys `main` once its CI checks pass, and migrations run on every start.
3. **First invite.** From your machine, against the production database:

   ```bash
   DATABASE_URL='<neon connection string>' CORS_ORIGIN='https://<your-app>.onrender.com' npm run invite
   ```

   Open the link, sign up, and invite everyone else from **File → Invite a Friend…**.

## The free plans

- The app sleeps after 15 minutes without visitors. The next visit takes about a minute to wake it, and open tabs reconnect by themselves.
- Neither plan needs a card. Without one, going over a limit suspends the service until the next month instead of billing: Render gives 750 instance hours a month (one service running all month) and a few GB of outbound traffic; Neon gives 100 compute hours and 1 GB of storage.
- The limits change; check [Render's](https://render.com/docs/free) and [Neon's](https://neon.com/pricing) pages.
