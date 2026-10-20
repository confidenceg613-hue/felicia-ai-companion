import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Her ten-hour check-in is scheduled per conversation from her own last message
// (see `saveMessage` in felicia.ts), so a quiet app costs nothing. This sweep is
// only the safety net for a thread whose timer was lost to a redeploy: it finds
// conversations that have been silent for ten hours, writes to at most six of
// them, and never doubles up with a timer that already fired.
crons.interval(
  "felicia checks quiet threads",
  { hours: 6 },
  internal.felicia.sweepIdle,
  {},
);

export default crons;
