Task 4: Cost Intelligence Engine
Background and context for developer
A major value-add of Vyrade is not only comparing platforms, but comparing total cost. A user may not know that automation cost includes platform subscription, tool subscription, API usage, AI token cost, hosting, and maintenance. Vyrade should surface estimated monthly cost before implementation.
Objective
Build a cost estimation service that uses the Automation Blueprint, tool pricing metadata, platform pricing assumptions, and estimated usage volume to produce a transparent cost breakdown.
Example / expected behaviour
Example cost output:
 { platform_cost: 20, tool_subscription_cost: 49, api_usage_cost: 12, ai_token_cost: 8, hosting_cost: 10, estimated_total: 99, confidence:'medium', assumptions:['1000 orders/month','Slack already owned','HubSpot paid plan not included'] }
Developer implementation guide
·        Extend tool schema with pricing_url, free_tier, starting_price, usage_based_pricing, included_usage, extra_usage_cost, currency, last_checked, confidence.
·        Create tool_pricing table for normalized plans.
·        Create platform_pricing_assumptions table.
·        Build cost_estimator service.
·        Input: automation_blueprint_id + recommendation_id + optional user volume.
·        Return cost by category plus assumptions and confidence.
·        Show low/medium/high confidence if pricing is incomplete.
·        Add admin override fields for pricing when scraping is unreliable.
Dependencies
Depends on
Why it matters
Future tasks depending on this
Task 1 Automation Blueprint
Provides systems/actions/volume.
Recommendation UI
Task 2 Platform Capability Database
Provides platform pricing assumptions.
Recommendation Engine
Tool/product database
Provides tool pricing and API availability.
Cost comparison

Definition of Done
·        Cost report generated for each recommended platform.
·        Breakdown includes platform, tools, API/token, hosting, and unknown costs.
·        Every estimate includes assumptions.
·        Missing price does not break recommendation; it returns unknown with low confidence.
·        Pricing records include source URL and last_checked date.
QA scenarios
·        No volume provided -> ask user or use default assumption with low confidence.
·        Tool with no public pricing -> mark unknown, do not hallucinate.
·        High expected operations should change Make/Zapier cost assumptions.
·        AI-heavy workflow should show token-cost estimate.
Common mistakes to avoid
·        Do not present guesses as exact cost.
·        Do not scrape pricing once and treat it as permanent.
·        Do not hide assumptions from the user.
