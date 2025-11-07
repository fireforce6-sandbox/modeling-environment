import type { LanguageClientOptions, ServerOptions } from 'vscode-languageclient/node.js';
import * as vscode from 'vscode';
import * as path from 'node:path';
import { LanguageClient, TransportKind } from 'vscode-languageclient/node.js';

let client: LanguageClient;

// This function is called when the extension is activated.
export async function activate(context: vscode.ExtensionContext): Promise<void> {
    client = await startLanguageClient(context);
    // Track open diagram panels and their associated document URIs
    const openPanels: Array<{ panel: vscode.WebviewPanel, uri: string }> = [];

    // Register the UI command to open a read-only diagram
    context.subscriptions.push(vscode.commands.registerCommand('oml.openDiagram', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return;
        }
        const docUri = editor.document.uri.toString();
        // Open a webview panel and wire messaging to fetch the diagram model from the language server
        const panel = vscode.window.createWebviewPanel(
            'omlDiagram',
            `OML Diagram: ${path.basename(editor.document.fileName)}`,
            vscode.ViewColumn.Beside,
            { enableScripts: true, localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'out', 'webview')] }
        );

        const scriptUri = panel.webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'out', 'webview', 'diagramClient.js'));
        const cssUri = panel.webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'out', 'webview', 'diagramClient.css'));

        // Detect theme kind (light vs dark)
        const themeKind = vscode.window.activeColorTheme.kind;
        const isLight = themeKind === vscode.ColorThemeKind.Light || themeKind === vscode.ColorThemeKind.HighContrastLight;

        panel.webview.html = `<!DOCTYPE html>
<html style="width: 100%; height: 100%;" data-vscode-theme-kind="${isLight ? 'light' : 'dark'}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" type="text/css" href="${cssUri}">
</head>
<body style="width: 100%; height: 100%; margin: 0; padding: 0;">
  <div id="sprotty" style="width: 100%; height: 100%;"></div>
  <script src="${scriptUri}"></script>
</body>
</html>`;

        // Track this panel and its document URI
        openPanels.push({ panel, uri: docUri });

        // Handle messages from the webview
        const disposeListener = panel.webview.onDidReceiveMessage(async (msg) => {
            if (msg?.type === 'requestModel') {
                const requestStart = Date.now();
                console.debug('[oml] webview requested model — forwarding to language server');
                try {
                    const model = await client.sendRequest('oml/diagramModel', { uri: docUri });
                    const requestDuration = Date.now() - requestStart;
                    console.debug(`[oml] received model from language server in ${requestDuration}ms`);
                    panel.webview.postMessage({ type: 'updateModel', model, _timings: { serverMs: requestDuration } });
                } catch (err) {
                    const requestDuration = Date.now() - requestStart;
                    console.error('[oml] Failed to get diagram model', err);
                    panel.webview.postMessage({ type: 'updateModel', model: { nodes: [], edges: [] }, _timings: { serverMs: requestDuration, error: true } });
                }
            }
        });
        panel.onDidDispose(() => {
            disposeListener.dispose();
            // Remove from openPanels
            const idx = openPanels.findIndex(p => p.panel === panel);
            if (idx >= 0) openPanels.splice(idx, 1);
        });
    }));

    // Debounced updates: schedule updates for changed documents and also update on save
    const updateTimeouts = new Map<string, NodeJS.Timeout>();

    async function updatePanelsForUri(uri: string) {
        for (const { panel, uri: panelUri } of openPanels) {
            if (panelUri === uri) {
                try {
                    console.debug(`[oml] requesting updated model for ${uri}`);
                    const model = await client.sendRequest('oml/diagramModel', { uri });
                    panel.webview.postMessage({ type: 'updateModel', model });
                    console.debug('[oml] posted updated model to webview');
                } catch (err) {
                    console.error('[oml] Failed to update diagram model after document change', err);
                }
            }
        }
    }

    context.subscriptions.push(vscode.workspace.onDidChangeTextDocument((event) => {
        if (event.document.languageId !== 'oml') return;
        const changedUri = event.document.uri.toString();
        // debounce rapid changes (typing)
        const existing = updateTimeouts.get(changedUri);
        if (existing) clearTimeout(existing);
        const t = setTimeout(() => {
            updateTimeouts.delete(changedUri);
            void updatePanelsForUri(changedUri);
        }, 300);
        updateTimeouts.set(changedUri, t);
    }));

    // Also update on save immediately
    context.subscriptions.push(vscode.workspace.onDidSaveTextDocument((doc) => {
        if (doc.languageId !== 'oml') return;
        const savedUri = doc.uri.toString();
        const existing = updateTimeouts.get(savedUri);
        if (existing) {
            clearTimeout(existing);
            updateTimeouts.delete(savedUri);
        }
        void updatePanelsForUri(savedUri);
    }));
}

// This function is called when the extension is deactivated.
export function deactivate(): Thenable<void> | undefined {
    if (client) {
        return client.stop();
    }
    return undefined;
}

async function startLanguageClient(context: vscode.ExtensionContext): Promise<LanguageClient> {
    const serverModule = context.asAbsolutePath(path.join('out', 'language', 'main.cjs'));
    // The debug options for the server
    // --inspect=6009: runs the server in Node's Inspector mode so VS Code can attach to the server for debugging.
    // By setting `process.env.DEBUG_BREAK` to a truthy value, the language server will wait until a debugger is attached.
    const debugOptions = { execArgv: ['--nolazy', `--inspect${process.env.DEBUG_BREAK ? '-brk' : ''}=${process.env.DEBUG_SOCKET || '6009'}`] };

    // If the extension is launched in debug mode then the debug server options are used
    // Otherwise the run options are used
    const serverOptions: ServerOptions = {
        run: { module: serverModule, transport: TransportKind.ipc },
        debug: { module: serverModule, transport: TransportKind.ipc, options: debugOptions }
    };

    // Options to control the language client
    const clientOptions: LanguageClientOptions = {
        documentSelector: [{ scheme: '*', language: 'oml' }]
    };

    // Create the language client and start the client.
    const client = new LanguageClient(
        'oml',
        'OML',
        serverOptions,
        clientOptions
    );

    // Start the client. This will also launch the server
    await client.start();
    return client;
}
