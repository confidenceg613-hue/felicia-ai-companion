import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Her first text of the day. 08:00 UTC is 09:00 in Lagos (WAT, UTC+1) — a
// natural morning to open a conversation. The function itself decides who is
// worth messaging and never sends more than a handful, so a quiet day with no
// conversations open costs nothing.
crons.cron("felicia reaches out", "0 8 * * *", internal.felicia.sendNudge, {});

export default crons;