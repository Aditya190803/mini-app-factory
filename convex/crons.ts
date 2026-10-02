import { cronJobs } from 'convex/server';
import { internal } from './_generated/api';

const crons = cronJobs();

crons.interval('reap stale generation runs', { minutes: 5 }, internal.conversations.reapStaleRuns, {});

crons.interval('alert on failure spikes', { minutes: 15 }, internal.alerts.alertOnFailureSpike, {});

export default crons;
