# Activate ydszmemory

Run `hermes memory setup` and select `ydszmemory`, then `hermes gateway restart`.
Verify loading with `hermes memory status` and search a phrase from a test conversation using
`hermes ydszmemory search "Python" -n 5 --corpus all`.

If dependencies fail to install, install `ydsz-memory[cli]` into Hermes' actual Python interpreter.
The native plugin does not include `ydszmemory.installer`.
See the [shared integration guide](https://github.com/TencentCloud/ydsz-memory/blob/main/docs/integrations.md#hermes).
