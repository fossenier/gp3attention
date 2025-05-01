// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  // Use the console to output diagnostic information (console.log) and errors (console.error)
  // This line of code will only be executed once when your extension is activated
  console.log('Congratulations, your extension "gp3attention" is now active!');

  // The command has been defined in the package.json file
  // Now provide the implementation of the command with registerCommand
  // The commandId parameter must match the command field in package.json
  const disposable = vscode.commands.registerCommand(
    "gp3attention.helloWorld",
    () => {
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
    }
  );

  context.subscriptions.push(disposable);
}

// This method is called when your extension is deactivated
export function deactivate() {}
