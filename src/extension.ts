import * as vscode from 'vscode';

let editor1: vscode.TextEditor | undefined;
let editor2: vscode.TextEditor | undefined;
let scrollSyncDisposable: vscode.Disposable | undefined;
let diffDecorationType: vscode.TextEditorDecorationType | undefined; // Added
let closeListenerDisposable: vscode.Disposable | undefined; // Added

// Define the decoration type for highlighting differences // Added
const diffHighlightOptions: vscode.DecorationRenderOptions = { // Added
    backgroundColor: 'rgba(255, 0, 0, 0.3)', // Red background with some transparency // Added
    isWholeLine: true, // Added
}; // Added

class FileComparerViewProvider implements vscode.WebviewViewProvider {
    private _view?: vscode.WebviewView;
    private _file1?: string;
    private _file2?: string;

    constructor(private readonly _extensionUri: vscode.Uri) {}

    resolveWebviewView(webviewView: vscode.WebviewView) {
        this._view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
        };
        
        webviewView.webview.onDidReceiveMessage(async (message) => {
            switch (message.command) {
                case 'selectFile1':
                    await vscode.commands.executeCommand('file-comparer.selectFile1');
                    break;
                case 'selectFile2':
                    await vscode.commands.executeCommand('file-comparer.selectFile2');
                    break;
                case 'compare':
                    await vscode.commands.executeCommand('file-comparer.compareFiles');
                    break;
            }
        });
        
        this._updateWebview();
    }

    private _updateWebview() {
        if (!this._view) {
            return;
        }

        this._view.webview.html = `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body {
                        padding: 15px;
                        font-family: var(--vscode-font-family);
                    }
                    button {
                        width: 100%;
                        padding: 8px;
                        margin: 5px 0;
                        background: var(--vscode-button-background);
                        color: var(--vscode-button-foreground);
                        border: none;
                        border-radius: 3px;
                        cursor: pointer;
                    }
                    button:disabled {
                        opacity: 0.5;
                        cursor: not-allowed;
                    }
                    button:hover:not(:disabled) {
                        background: var(--vscode-button-hoverBackground);
                    }
                </style>
            </head>
            <body>
                <button id="file1">Select File 1${this._file1 ? ': ' + this._file1 : ''}</button>
                <button id="file2">Select File 2${this._file2 ? ': ' + this._file2 : ''}</button>
                <button id="compare" ${(!this._file1 || !this._file2) ? 'disabled' : ''}>Compare Files</button>
                <script>
                    const vscode = acquireVsCodeApi();
                    document.getElementById('file1').addEventListener('click', () => {
                        vscode.postMessage({ command: 'selectFile1' });
                    });
                    document.getElementById('file2').addEventListener('click', () => {
                        vscode.postMessage({ command: 'selectFile2' });
                    });
                    document.getElementById('compare').addEventListener('click', () => {
                        vscode.postMessage({ command: 'compare' });
                    });
                </script>
            </body>
            </html>
        `;
    }

    setFile1(path: string) {
        this._file1 = path;
        this._updateWebview();
    }

    setFile2(path: string) {
        this._file2 = path;
        this._updateWebview();
    }

    getFiles() {
        return { file1: this._file1, file2: this._file2 };
    }
}

export function activate(context: vscode.ExtensionContext) {
    const provider = new FileComparerViewProvider(context.extensionUri);

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('fileComparerView', provider)
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('file-comparer.selectFile1', async () => {
            const files = await vscode.window.showOpenDialog({
                canSelectFiles: true,
                canSelectFolders: false,
                canSelectMany: false
            });
            if (files && files[0]) {
                provider.setFile1(files[0].fsPath);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('file-comparer.selectFile2', async () => {
            const files = await vscode.window.showOpenDialog({
                canSelectFiles: true,
                canSelectFolders: false,
                canSelectMany: false
            });
            if (files && files[0]) {
                provider.setFile2(files[0].fsPath);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('file-comparer.compareFiles', async () => {
            const { file1, file2 } = provider.getFiles();
            if (file1 && file2) {
                // Open first file in the active editor group
                const doc1 = await vscode.workspace.openTextDocument(file1);
                await vscode.window.showTextDocument(doc1, vscode.ViewColumn.One);

                // Open second file in the editor group to the right
                const doc2 = await vscode.workspace.openTextDocument(file2);
                await vscode.window.showTextDocument(doc2, { 
                    viewColumn: vscode.ViewColumn.Beside,
                    preserveFocus: false,
                    preview: false // Ensure it opens as a real editor
                });

                // Store references to the editors
                editor1 = vscode.window.visibleTextEditors.find(editor => editor.document.uri.toString() === doc1.uri.toString());
                editor2 = vscode.window.visibleTextEditors.find(editor => editor.document.uri.toString() === doc2.uri.toString());

                // Dispose previous listeners and clear decorations
                if (scrollSyncDisposable) {
                    scrollSyncDisposable.dispose();
                    scrollSyncDisposable = undefined;
                }
                if (closeListenerDisposable) {
                    closeListenerDisposable.dispose();
                    closeListenerDisposable = undefined;
                }
                if (diffDecorationType) {
                    editor1?.setDecorations(diffDecorationType, []); // Clear previous decorations
                    editor2?.setDecorations(diffDecorationType, []);
                } else {
                    // Ensure decoration type is created if it wasn't already
                    diffDecorationType = vscode.window.createTextEditorDecorationType(diffHighlightOptions);
                    context.subscriptions.push(diffDecorationType); // Add to subscriptions for disposal on deactivate
                }


                // Add scroll synchronization and diff highlighting
                if (editor1 && editor2 && diffDecorationType) { // Ensure decoration type exists
                    const editor1Doc = editor1.document;
                    const editor2Doc = editor2.document;
                    const decorations1: vscode.Range[] = [];
                    const decorations2: vscode.Range[] = [];

                    const maxLines = Math.max(editor1Doc.lineCount, editor2Doc.lineCount);

                    for (let i = 0; i < maxLines; i++) {
                        const line1Text = i < editor1Doc.lineCount ? editor1Doc.lineAt(i).text : undefined;
                        const line2Text = i < editor2Doc.lineCount ? editor2Doc.lineAt(i).text : undefined;

                        const firstWord1 = line1Text?.trim().split(/\s+/)[0];
                        const firstWord2 = line2Text?.trim().split(/\s+/)[0];

                        if (firstWord1 !== firstWord2) {
                            if (line1Text !== undefined) {
                                decorations1.push(new vscode.Range(i, 0, i, line1Text.length));
                            }
                            if (line2Text !== undefined) {
                                decorations2.push(new vscode.Range(i, 0, i, line2Text.length));
                            }
                        }
                    }

                    editor1.setDecorations(diffDecorationType, decorations1);
                    editor2.setDecorations(diffDecorationType, decorations2);


                    // Scroll Sync Logic (moved slightly down)
                    let scrollingSelf = false; // Flag to prevent infinite loops

                    const listener = vscode.window.onDidChangeTextEditorVisibleRanges(event => {
                        if (scrollingSelf) {
                            scrollingSelf = false; // Reset flag after self-triggered scroll
                            return;
                        }

                        if (event.textEditor === editor1 && editor2) {
                            scrollingSelf = true; // Set flag before scrolling the other editor
                            editor2.revealRange(event.visibleRanges[0], vscode.TextEditorRevealType.AtTop);
                        } else if (event.textEditor === editor2 && editor1) {
                            scrollingSelf = true; // Set flag before scrolling the other editor
                            editor1.revealRange(event.visibleRanges[0], vscode.TextEditorRevealType.AtTop);
                        }
                    });
                    
                    // Store the disposable to remove the listener later
                    scrollSyncDisposable = listener;
                    context.subscriptions.push(scrollSyncDisposable);

                    // Also handle editor closure to clear references, listeners, and decorations
                    closeListenerDisposable = vscode.window.onDidChangeVisibleTextEditors(editors => { // Assign to disposable
                        const editor1StillVisible = editors.some(e => e === editor1);
                        const editor2StillVisible = editors.some(e => e === editor2);

                        // If either editor is closed, clean up everything related to this comparison session
                        if (!editor1StillVisible || !editor2StillVisible) {
                            if (scrollSyncDisposable) {
                                scrollSyncDisposable.dispose();
                                scrollSyncDisposable = undefined;
                            }
                            // Clear decorations on the remaining editor if it exists
                            if (diffDecorationType) {
                                if (editor1StillVisible && editor1) editor1.setDecorations(diffDecorationType, []);
                                if (editor2StillVisible && editor2) editor2.setDecorations(diffDecorationType, []);
                            }

                            editor1 = undefined;
                            editor2 = undefined;

                            // Dispose this listener itself as it's no longer needed for this pair
                            if (closeListenerDisposable) {
                                closeListenerDisposable.dispose();
                                closeListenerDisposable = undefined;
                            }
                        }
                    });
                    context.subscriptions.push(closeListenerDisposable); // Add this listener too
                }
            }
        })
    );
}

// This method is called when your extension is deactivated
export function deactivate() {
    // Dispose of listeners and decoration types if they exist
    if (scrollSyncDisposable) {
        scrollSyncDisposable.dispose();
    }
    if (closeListenerDisposable) {
        closeListenerDisposable.dispose();
    }
    if (diffDecorationType) {
        diffDecorationType.dispose();
    }
}
