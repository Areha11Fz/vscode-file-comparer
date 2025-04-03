import * as vscode from 'vscode';

let editor1: vscode.TextEditor | undefined;
let editor2: vscode.TextEditor | undefined;
let scrollSyncDisposable: vscode.Disposable | undefined;

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

                // Dispose previous listener if exists
                if (scrollSyncDisposable) {
                    scrollSyncDisposable.dispose();
                }

                // Add scroll synchronization
                if (editor1 && editor2) {
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

                    // Also handle editor closure to clear references and listener
                    const closeListener = vscode.window.onDidChangeVisibleTextEditors(editors => {
                        const editor1Visible = editors.some(e => e === editor1);
                        const editor2Visible = editors.some(e => e === editor2);

                        if (!editor1Visible || !editor2Visible) {
                            if (scrollSyncDisposable) {
                                scrollSyncDisposable.dispose();
                                scrollSyncDisposable = undefined;
                            }
                            editor1 = undefined;
                            editor2 = undefined;
                            // We might want to remove this listener itself if it's no longer needed
                            // closeListener.dispose(); // Or manage its lifecycle differently
                        }
                    });
                    context.subscriptions.push(closeListener); // Add this listener too
                }
            }
        })
    );
}

// This method is called when your extension is deactivated
export function deactivate() {}
