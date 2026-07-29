// Sentry initialization for the Node server runtime (App Router route handlers,
// server actions, RSC). Options are centralised + privacy-hardened in
// lib/monitoring/sentryScrub.js — DSN from env, prod-gated, PII scrubbed.
import * as Sentry from "@sentry/nextjs";
import { baseSentryOptions } from "./lib/monitoring/sentryScrub.js";

Sentry.init(baseSentryOptions());
