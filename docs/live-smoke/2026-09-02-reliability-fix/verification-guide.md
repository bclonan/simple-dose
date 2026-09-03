# Native verification notes

The browser client exposes a discovered tool set. Pass that set explicitly to an execution helper. Do not assume a helper that retained an earlier tool set will use a later assignment in a separate interactive execution cell.

After a declaration change, acquire the current capability and discover the current tools. Read the returned schema and use current IDs and revisions. For stable Explorer declarations, read `workspaceRevision` from `cleardose_get_explorer_state` or the preceding successful mutation result.

```js
const capability = await tab.capabilities.get('webmcp')
const currentTools = await capability.fetchTools()
const state = await currentTools.call('cleardose_get_explorer_state', {
  section: 'workspace',
  limit: 5,
})
```

Keep a tool result before attempting screenshots or receipt inspection. If a call fails before returning a result, inspect the visible log and state before considering another mutation. A stale registration error is not permission to replay an uncertain cart addition or checkout.

The first preview verification retained a stale tool-set reference. The visible state and receipt showed that two attempted fact-card calls had not run. Direct execution through a newly discovered set then created exactly two cards. No page reload or browser reset was needed for that recovery.

One read-only call also encountered an automatic permission-review timeout. The browser explicitly allowed one retry. That retry succeeded. This was a verification-client event, not an application or provider failure.

The same preview later reached a browser configuration-limit error after 32 successful app receipts. See `configuration-incident.json`. Its internal threshold was not disclosed. This requires a configuration correction and a separate release verification pass, not a claim that resetting the unchanged page fixed it.

The first pass screenshots are historical evidence. Receipt steps 17 and 19 did not execute in the app. Step 17's drawer capture shows the preceding call, which confirms the absence of a new receipt. Step 20 is the first successful fact-card creation. Screenshot 11 captured a drawer transition; screenshot 14 shows the settled two-line cart.
