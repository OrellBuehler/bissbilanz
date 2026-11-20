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

<h2 class="mb-3 mt-8 text-xl font-semibold">Assistant chat in the app</h2>
<p class="mb-3">
	If Claude is enabled for your account, you can also chat with the assistant directly in
	Bissbilanz, without connecting anything. Ask about your progress, get meal ideas that fit your
	goals, or tell it what you ate; it looks up your data and logs, creates or corrects entries,
	foods, recipes, goals, weight, sleep and supplements for you, as well as finished fasts, logging
	reminders, your own meal types and display settings such as the dashboard widgets or the water
	goal, and says what it changed. It cannot see or stop a fast that is still running, and the app
	language, time zone and account settings stay with you. These only happen after you confirm them
	in the chat: deleting, merging foods, copying a day, removing a supplement log, changing the
	nutrition, serving size or photo of a food you already logged (directly or in a logged recipe),
	replacing or removing the photo of any food or recipe, clearing a day's note, water or activity
	details or all the labels the assistant gave a food or recipe, changing a recipe's ingredients or
	steps (or the servings or cooked weight of a recipe you already logged), changing a supplement's
	ingredients, replacing the time windows for favourites, removing visible nutrients or pinned
	insights, anything forced, and every change after the first ten in one answer.
</p>
<p class="mb-6">
	Your messages, the photos you attach, the earlier conversation and whatever diary data the
	assistant looks up to answer (that can be any of your data) are sent to Anthropic, the provider of
	Claude. Conversations stay until you delete them and are part of your data export. Chat uses your
	monthly Claude budget, and a long conversation eventually asks you to start a new one.
</p>
