import * as vscode from 'vscode';

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
                const uri1 = vscode.Uri.file(file1);
                const uri2 = vscode.Uri.file(file2);
                await vscode.commands.executeCommand('vscode.diff', uri1, uri2);
            }
        })
    );
}

// This method is called when your extension is deactivated
export function deactivate() {}
