import * as vscode from 'vscode';

export function grabStatically() {
  return vscode.commands.registerCommand("gp3attention.grabStatically", () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showInformationMessage("No active editor!");
      return;
    }

    // The code you place here will be executed every time your command is executed
    // Display a message box to the user
    const one = new vscode.Position(0, 0);
    const two = new vscode.Position(0, 5);
    const range = new vscode.Range(one, two);

    const document = editor.document;
    const textInRange = document.getText(range);

    vscode.window.showInformationMessage(
      `Text in range (0,0)-(0,5): "${textInRange}"`
    );
  });
}

export function grabOnYCoord() {
  return vscode.commands.registerCommand("gp3attention.grabOnYCoord", () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showInformationMessage("No active editor!");
      return;
    }

    // TODO: solve this Mac vs Everybody else issue
    //   const GOLDEN_LINE_HEIGHT_RATIO = platform.isMacintosh ? 1.5 : 1.35;
    const GOLDEN_LINE_HEIGHT_RATIO = 1.5;
    const MINIMUM_LINE_HEIGHT = 8;

    const config = vscode.workspace.getConfiguration("editor");
    const fontSize = config.get<number>("fontSize") || 10;
    console.log("Editor font size is:", fontSize);

    const lineHeight = Math.round(GOLDEN_LINE_HEIGHT_RATIO * fontSize);

    // Test grabbing line 7
    const lineHeightInPixels = Math.max(lineHeight, MINIMUM_LINE_HEIGHT);
    const input = Math.round((7 * lineHeightInPixels) / lineHeightInPixels) - 1;
    const pos1 = new vscode.Position(input, 0);
    const pos2 = new vscode.Position(input, 3);
    const range = new vscode.Range(pos1, pos2);

    const document = editor.document;
    const textInRange = document.getText(range);

    vscode.window.showInformationMessage(
      `Text in range (0,0)-(0,5): "${textInRange}"`
    );
  });
}

export function showCalibrationText(uri: vscode.Uri) {
  return vscode.commands.registerCommand(
    "gp3attention.showCalibrationText",
    async () => {
      // Save the currently active editor (for restoration later)
      const previousEditor = vscode.window.activeTextEditor;

      // Open the virtual document
      const doc = await vscode.workspace.openTextDocument(uri);
      await vscode.window.showTextDocument(doc, vscode.ViewColumn.Active);

      // Optionally: After showing the calibration text, wait and restore
      // Here we use a simple message box to ask the user

      vscode.window
        .showInformationMessage(
          "Calibration done! Go back to your previous file?",
          "Yes",
          "No"
        )
        .then((selection) => {
          if (selection === "Yes" && previousEditor) {
            vscode.window.showTextDocument(
              previousEditor.document,
              previousEditor.viewColumn
            );
          }
        });
    }
  );
}
