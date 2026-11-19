<script>
    import { S } from "../lib/state.svelte.js";

    function close() {
        S.settingsOpen = false;
    }

    function onKey(e) {
        if (e.key === "Escape" && S.settingsOpen) close();
    }

    // Close only when the click lands on the backdrop itself, not the dialog.
    function onBackdropClick(e) {
        if (e.target === e.currentTarget) close();
    }
</script>

<svelte:window onkeydown={onKey} />

{#if S.settingsOpen}
    <!-- Click-away is a visual affordance; Esc and × are the keyboard paths. -->
    <!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
    <div
        class="backdrop"
        onclick={onBackdropClick}
    >
        <div
            class="modal"
            role="dialog"
            aria-label="Settings"
            tabindex="-1"
        >
            <div class="modal-head">
                <span class="modal-title">settings</span>
                <span class="spacer"></span>
                <button
                    class="icon"
                    title="Close (Esc)"
                    onclick={close}>×</button
                >
            </div>
            <div class="modal-body">
                <h4>view</h4>
                <label
                    ><input
                        type="checkbox"
                        checked={S.uiSettings.expandTools}
                        onchange={(e) =>
                            S.settingChange("expandTools", e.target.checked)}
                    /> Expanded tools</label
                >
                <label
                    ><input
                        type="checkbox"
                        checked={S.uiSettings.expandThink}
                        onchange={(e) =>
                            S.settingChange("expandThink", e.target.checked)}
                    /> Expanded thinking</label
                >
                <label
                    ><input
                        type="checkbox"
                        checked={S.uiSettings.showHidden}
                        onchange={(e) =>
                            S.settingChange("showHidden", e.target.checked)}
                    /> Show hidden projects</label
                >

                <h4>fonts <span class="hint">blank = default</span></h4>
                <div class="font-row">
                    <span class="flabel">ui</span>
                    <input
                        class="finput"
                        type="text"
                        list="sys-fonts"
                        placeholder="default"
                        value={S.uiSettings.uiFont}
                        onchange={(e) =>
                            S.settingChange("uiFont", e.target.value.trim())}
                    />
                    <input
                        class="fsize"
                        type="number"
                        min="8"
                        max="28"
                        step="0.5"
                        title="size in px"
                        value={S.uiSettings.uiFontSize}
                        onchange={(e) =>
                            S.settingChange(
                                "uiFontSize",
                                Number(e.target.value),
                            )}
                    />
                </div>
                <div class="font-row">
                    <span class="flabel">chat</span>
                    <input
                        class="finput"
                        type="text"
                        list="sys-fonts"
                        placeholder="default"
                        value={S.uiSettings.chatFont}
                        onchange={(e) =>
                            S.settingChange("chatFont", e.target.value.trim())}
                    />
                    <input
                        class="fsize"
                        type="number"
                        min="8"
                        max="28"
                        step="0.5"
                        title="size in px"
                        value={S.uiSettings.chatFontSize}
                        onchange={(e) =>
                            S.settingChange(
                                "chatFontSize",
                                Number(e.target.value),
                            )}
                    />
                </div>
                <div class="font-row">
                    <span class="flabel">code</span>
                    <input
                        class="finput"
                        type="text"
                        list="sys-fonts"
                        placeholder="default"
                        value={S.uiSettings.codeFont}
                        onchange={(e) =>
                            S.settingChange("codeFont", e.target.value.trim())}
                    />
                    <input
                        class="fsize"
                        type="number"
                        min="8"
                        max="28"
                        step="0.5"
                        title="size in px"
                        value={S.uiSettings.codeFontSize}
                        onchange={(e) =>
                            S.settingChange(
                                "codeFontSize",
                                Number(e.target.value),
                            )}
                    />
                </div>
                <datalist id="sys-fonts">
                    {#each S.systemFonts as f}<option value={f} />{/each}
                </datalist>

                <h4>notifications</h4>
                <label
                    ><input
                        type="checkbox"
                        checked={S.uiSettings.notifyDesktop}
                        onchange={(e) =>
                            S.settingChange("notifyDesktop", e.target.checked)}
                    /> Desktop notification on background finish</label
                >
                <label
                    ><input
                        type="checkbox"
                        checked={S.uiSettings.notifySound}
                        onchange={(e) =>
                            S.settingChange("notifySound", e.target.checked)}
                    /> Sound on background finish</label
                >

                <h4>pi</h4>
                <label
                    ><input
                        type="checkbox"
                        checked={S.hooksInstalled}
                        onchange={(e) => S.setHooksEnabled(e.target.checked)}
                    /> Instrument hooks</label
                >
                <button
                    class="ghost"
                    onclick={S.openPkgs}>Packages and MCP</button
                >

                <h4>updates</h4>
                <div class="modal-actions">
                    <button
                        class="ghost"
                        onclick={() => S.runUpdate("extensions")}
                        >Update extensions</button
                    >
                    <button
                        class="ghost"
                        onclick={() => S.runUpdate("self")}>Update pi</button
                    >
                </div>
                {#if S.updOut}<pre class="upd-out">{S.updOut}</pre>{/if}
            </div>
        </div>
    </div>
{/if}

<style lang="scss">
    .backdrop {
        position: fixed;
        inset: 0;
        z-index: 70;
        background: rgba(6, 8, 12, 0.6);
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .modal {
        width: min(440px, calc(100vw - 32px));
        max-height: calc(100vh - 48px);
        display: flex;
        flex-direction: column;
        background: var(--panel);
        border: 1px solid var(--line);
        border-radius: 8px;
        box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
        outline: none;

        .modal-head {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 10px 14px;
            border-bottom: 1px solid var(--line);
            flex: none;
            .modal-title {
                font-size: calc(12px * var(--s-ui));
                color: var(--fg);
                font-weight: 600;
            }
            .spacer {
                flex: 1;
            }
        }

        .modal-body {
            padding: 14px;
            overflow-y: auto;
            display: flex;
            flex-direction: column;
            gap: 8px;
            h4 {
                margin: 10px 0 2px;
                font-size: calc(10px * var(--s-ui));
                color: var(--mute);
                font-weight: 600;
                letter-spacing: 0.06em;
                text-transform: uppercase;
                &:first-child {
                    margin-top: 0;
                }
            }
            label {
                display: flex;
                align-items: center;
                gap: 8px;
                font-size: calc(12px * var(--s-ui));
                color: var(--dim);
                cursor: pointer;
                input {
                    accent-color: var(--accent);
                }
            }
            button.ghost {
                text-align: left;
            }

            .hint {
                color: var(--mute);
                font-size: calc(10px * var(--s-ui));
                font-weight: 400;
                letter-spacing: 0;
                text-transform: none;
            }
            .font-row {
                display: flex;
                align-items: center;
                gap: 8px;
                .flabel {
                    width: 36px;
                    flex: none;
                    font-size: calc(12px * var(--s-ui));
                    color: var(--dim);
                }
                .fsize {
                    width: 58px;
                    flex: none;
                }
            }
            .finput,
            .fsize {
                background: var(--ui-bg);
                border: 1px solid var(--line);
                color: var(--fg);
                border-radius: 5px;
                padding: 4px 8px;
                font-size: calc(11.5px * var(--s-ui));
                outline: none;
                min-width: 0;
                &:focus {
                    border-color: var(--accent);
                }
            }
            .finput {
                flex: 1;
            }
        }

        .modal-actions {
            display: flex;
            gap: 8px;
            button {
                flex: 1;
            }
        }
        .upd-out {
            max-height: 160px;
            overflow-y: auto;
            background: var(--code-bg);
            border: 1px solid var(--line-soft);
            border-radius: 6px;
            padding: 8px;
            font-size: calc(11px * var(--s-ui));
            white-space: pre-wrap;
            word-break: break-word;
            color: var(--dim);
        }
    }
</style>
