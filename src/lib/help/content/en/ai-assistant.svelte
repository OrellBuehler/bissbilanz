<h2 class="mb-3 mt-8 text-xl font-semibold">Connecting an assistant</h2>
<p class="mb-6">
	Bissbilanz exposes your diary as a remote MCP server, so an AI assistant can log and review your
	data in plain language — search or create foods, log entries, check your progress, log weight or
	supplements, and more. Open <strong>Settings → MCP</strong> to connect one.
</p>
<p class="mb-3">Depending on the client you use:</p>
<ul class="mb-6 list-disc space-y-1 pl-6">
	<li>
		<strong>claude.ai</strong> (web, desktop or mobile) — Settings → Connectors → Add custom connector,
		paste the server URL shown on the MCP settings page, connect and approve.
	</li>
	<li>
		<strong>Claude Code</strong> — copy the command shown on the MCP settings page, run it, then run
		<code>/mcp</code> to sign in.
	</li>
	<li>
		<strong>Other MCP clients</strong> — most support pasting the server URL directly. A client that
		can't discover it that way can use the pre-registered client ID and secret under
		<strong>Advanced</strong> on the same page.
	</li>
</ul>
<p class="mb-6">
	You approve each client once on a consent screen that names it and where it came from. Revoke
	access at any time from <strong>Settings → MCP → Connected Applications</strong> — that drops every
	token the client holds immediately.
</p>

<h2 class="mb-3 mt-8 text-xl font-semibold">What it can do</h2>
<p class="mb-6">
	A connected assistant can read and write your diary, foods, recipes, goals, weight, sleep,
	supplements and statistics — the same conventions apply everywhere (dates in your timezone,
	capitalized meal types, searching before creating a food). It's a normal conversation: "I had two
	eggs and toast for breakfast" is enough for it to find or create the foods and log the entry.
</p>

<h2 class="mb-3 mt-8 text-xl font-semibold">AI tasks — logging by photo</h2>
<p class="mb-6">
	Prefer to snap a photo instead of typing? Open <strong>AI tasks</strong> and capture up to five photos
	and/or a description, with an optional meal and time — it's queued rather than logged immediately. The
	next time your connected assistant checks in, it reviews the queue and logs the entry for you (or you
	can describe and log it yourself in the same conversation).
</p>
