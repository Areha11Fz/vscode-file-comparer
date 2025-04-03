import * as vscode from 'vscode';

let editor1: vscode.TextEditor | undefined;
let editor2: vscode.TextEditor | undefined;
let scrollSyncDisposable: vscode.Disposable | undefined;
let redDecorationType: vscode.TextEditorDecorationType | undefined; // Renamed from diffDecorationType
let yellowDecorationType: vscode.TextEditorDecorationType | undefined; // Added for yellow highlight
let closeListenerDisposable: vscode.Disposable | undefined;
let textChangeListenerDisposable: vscode.Disposable | undefined;
let saveListenerDisposable: vscode.Disposable | undefined;

// Protobuf scalar types (add more if needed, e.g., fixed32, sfixed32, etc.)
const protobufTypes = new Set([
    'double', 'float', 'int32', 'int64', 'uint32', 'uint64',
    'sint32', 'sint64', 'fixed32', 'fixed64', 'sfixed32', 'sfixed64',
    'bool', 'string', 'bytes'
]);

// Define the decoration type for RED highlighting (completely different, non-type)
const redHighlightOptions: vscode.DecorationRenderOptions = {
    backgroundColor: 'rgba(255, 0, 0, 0.3)', // Red background
    isWholeLine: true,
};

// Define the decoration type for YELLOW highlighting (potential type mismatch) // Added
const yellowHighlightOptions: vscode.DecorationRenderOptions = { // Added
    backgroundColor: 'rgba(255, 255, 0, 0.3)', // Yellow background // Added
    isWholeLine: true, // Added
}; // Added

// Function to perform the comparison and apply highlighting
function updateDiffHighlighting() {
    // Ensure editors and decoration types are valid
    if (!editor1 || !editor2 || !redDecorationType || !yellowDecorationType) {
        return;
    }

    const editor1Doc = editor1.document;
    const editor2Doc = editor2.document;
    const redDecorations1: vscode.Range[] = []; // For red highlights
    const redDecorations2: vscode.Range[] = [];
    const yellowDecorations1: vscode.Range[] = []; // For yellow highlights
    const yellowDecorations2: vscode.Range[] = [];

    const maxLines = Math.max(editor1Doc.lineCount, editor2Doc.lineCount);

    for (let i = 0; i < maxLines; i++) {
        const line1Text = i < editor1Doc.lineCount ? editor1Doc.lineAt(i).text : undefined;
        const line2Text = i < editor2Doc.lineCount ? editor2Doc.lineAt(i).text : undefined;

        const firstWord1 = line1Text?.trim().split(/\s+/)[0] || ''; // Handle empty lines
        const firstWord2 = line2Text?.trim().split(/\s+/)[0] || '';

        if (firstWord1 !== firstWord2) {
            const isType1 = protobufTypes.has(firstWord1);
            const isType2 = protobufTypes.has(firstWord2);
            const range1 = line1Text !== undefined ? editor1Doc.lineAt(i).range : undefined;
            const range2 = line2Text !== undefined ? editor2Doc.lineAt(i).range : undefined;

            // New Logic: Yellow ONLY if BOTH are NOT types. Red otherwise.
            if (!isType1 && !isType2) { // Both are NOT protobuf types -> Yellow
                if (range1) yellowDecorations1.push(range1);
                if (range2) yellowDecorations2.push(range2);
            } else { // At least one IS a protobuf type (or lines mismatch existence) -> Red
                if (range1) redDecorations1.push(range1);
                if (range2) redDecorations2.push(range2);
            }
        }
    }

    // Apply decorations (clear previous of the specific type first)
    editor1.setDecorations(redDecorationType, redDecorations1);
    editor1.setDecorations(yellowDecorationType, yellowDecorations1);
    editor2.setDecorations(redDecorationType, redDecorations2);
    editor2.setDecorations(yellowDecorationType, yellowDecorations2);
}


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
                 // Dispose previous text change listener
                if (textChangeListenerDisposable) {
                    textChangeListenerDisposable.dispose();
                    textChangeListenerDisposable = undefined;
                }
                 // Dispose previous save listener
                if (saveListenerDisposable) {
                    saveListenerDisposable.dispose();
                    saveListenerDisposable = undefined;
                }

                // Clear previous decorations and ensure types exist
                if (redDecorationType) {
                    editor1?.setDecorations(redDecorationType, []);
                    editor2?.setDecorations(redDecorationType, []);
                } else {
                    redDecorationType = vscode.window.createTextEditorDecorationType(redHighlightOptions);
                    context.subscriptions.push(redDecorationType);
                }
                if (yellowDecorationType) {
                    editor1?.setDecorations(yellowDecorationType, []);
                    editor2?.setDecorations(yellowDecorationType, []);
                } else {
                    yellowDecorationType = vscode.window.createTextEditorDecorationType(yellowHighlightOptions);
                    context.subscriptions.push(yellowDecorationType);
                }


                // Add scroll synchronization and initial diff highlighting
                if (editor1 && editor2 && redDecorationType && yellowDecorationType) { // Ensure types exist
                    // Initial highlighting
                    updateDiffHighlighting();

                    // Scroll Sync Logic
                    let scrollingSelf = false;

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
                             // Dispose text change listener
                            if (textChangeListenerDisposable) {
                                textChangeListenerDisposable.dispose();
                                textChangeListenerDisposable = undefined;
                            }
                             // Dispose save listener
                            if (saveListenerDisposable) {
                                saveListenerDisposable.dispose();
                                saveListenerDisposable = undefined;
                            }

                            // Clear decorations on the remaining editor if it exists
                            if (redDecorationType) {
                                if (editor1StillVisible && editor1) editor1.setDecorations(redDecorationType, []);
                                if (editor2StillVisible && editor2) editor2.setDecorations(redDecorationType, []);
                            }
                            if (yellowDecorationType) {
                                if (editor1StillVisible && editor1) editor1.setDecorations(yellowDecorationType, []);
                                if (editor2StillVisible && editor2) editor2.setDecorations(yellowDecorationType, []);
                            }

                            editor1 = undefined; // Clear editor refs
                            editor2 = undefined;

                            // Dispose this close listener itself
                            if (closeListenerDisposable) {
                                closeListenerDisposable.dispose();
                                closeListenerDisposable = undefined;
                            }
                        }
                    });
                    context.subscriptions.push(closeListenerDisposable);

                    // Add listener for text document changes
                    textChangeListenerDisposable = vscode.workspace.onDidChangeTextDocument(event => {
                        if (editor1 && event.document === editor1.document || editor2 && event.document === editor2.document) {
                            // Add a small delay to avoid excessive updates while typing rapidly
                            // This is a simple debounce mechanism
                            setTimeout(updateDiffHighlighting, 150); 
                        }
                    });
                    context.subscriptions.push(textChangeListenerDisposable);

                    // Add listener for document saves
                    saveListenerDisposable = vscode.workspace.onDidSaveTextDocument(document => {
                         if (editor1 && document === editor1.document || editor2 && document === editor2.document) {
                            updateDiffHighlighting(); // Update immediately on save
                        }
                    });
                    context.subscriptions.push(saveListenerDisposable);
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
    if (closeListenerDisposable) { // Dispose all listeners on deactivate
        closeListenerDisposable.dispose();
    }
    if (textChangeListenerDisposable) {
        textChangeListenerDisposable.dispose();
    }
    if (saveListenerDisposable) {
        saveListenerDisposable.dispose();
    }
    if (redDecorationType) { // Dispose decoration types
        redDecorationType.dispose();
    }
    if (yellowDecorationType) {
        yellowDecorationType.dispose();
    }
}
