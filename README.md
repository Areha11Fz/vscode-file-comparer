# File Comparer Extension

This Visual Studio Code extension provides a side-by-side view for comparing two files, with synchronized scrolling and intelligent line highlighting.

## Features

*   **Side-by-Side View:** Select two files using the dedicated "File Comparer" view in the Activity Bar and click "Compare Files" to open them next to each other.
*   **Synchronized Scrolling:** When scrolling in one editor pane, the other pane automatically scrolls to the corresponding position.
*   **Difference Highlighting:** Lines are highlighted based on differences in their first word (ignoring leading whitespace):
    *   **Yellow Highlight:** Applied if the first words differ, and *neither* word is a standard Protobuf scalar data type (e.g., `MyCustomType` vs `AnotherCustomType`).
    *   **Red Highlight:** Applied if the first words differ, and *at least one* word is a standard Protobuf scalar data type (e.g., `string` vs `int32`, or `MyCustomType` vs `bool`), or if one file has a line where the other doesn't.
*   **Automatic Updates:** Highlighting automatically refreshes when either of the compared files is edited or saved.

## How to Use

1.  Open the "File Comparer" view from the Activity Bar (or use the Command Palette: `View: Show File Comparer`).
2.  Click "Select File 1" and choose the first file.
3.  Click "Select File 2" and choose the second file.
4.  Click "Compare Files".
5.  The files will open side-by-side with synchronized scrolling and highlighting enabled.

## Requirements

No external requirements or dependencies.

## Extension Settings

This extension does not add any VS Code settings.

## Known Issues

*   Highlighting is based only on the *first word* of each line. More complex diffing is not performed.
*   The list of recognized Protobuf types is limited to common scalar types.

## Release Notes

### 0.0.1

*   Initial release.
*   Side-by-side file comparison view.
*   Synchronized scrolling between compared files.
*   Line highlighting based on first-word differences (Protobuf type aware).
*   Automatic highlighting updates on file edit/save.

---

**Enjoy!**
