<h2 class="mb-3 mt-8 text-xl font-semibold">Connecting an assistant</h2>
<p class="mb-6">
	Bissbilanz exposes your diary as a remote MCP server, so an AI assistant can log and review your
	data in plain language — search or create foods, log entries, check your progress, log weight or
	supplements, and more. Open <strong>Settings → Connect an assistant</strong> in the app (or
	<strong>Settings → MCP</strong> on the web) to connect one.
</p>
<p class="mb-3">Depending on the assistant you use:</p>
<ul class="mb-6 list-disc space-y-1 pl-6">
	<li>
		<strong>Claude</strong> (web, desktop or mobile) — tap <strong>Connect to Claude</strong>.
		Claude opens with the Bissbilanz connector already filled in; confirm it, then approve access on
		the Bissbilanz page. Once added, it also works in the Claude mobile apps.
	</li>
	<li>
		<strong>ChatGPT</strong> — web only for now, not in the ChatGPT phone app yet, and it needs a Plus
		or Pro plan. On chatgpt.com open Settings → Security and login and turn on Developer mode, go to chatgpt.com/plugins,
		click “+”, paste the server URL, choose CIMD as the OAuth method and create it. Approve access on
		the Bissbilanz page, then enable Bissbilanz from the “+” menu in the message box.
	</li>
	<li>
		<strong>Gemini</strong> — not available in Switzerland yet.
	</li>
	<li>
		<strong>Claude Code</strong> — copy the command shown on the connect page, run it, then run
		<code>/mcp</code> to sign in.
	</li>
	<li>
		<strong>Other MCP clients</strong> — most support pasting the server URL directly. A client that
		can't discover it that way can use the pre-registered client ID and secret under
		<strong>Advanced</strong> on the web settings page.
	</li>
</ul>
<p class="mb-6">
	You approve each assistant once on a consent screen that names it and where it came from. Revoke
	access at any time from <strong>Settings → MCP → Connected Applications</strong> — that drops every
	token the assistant holds immediately.
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
