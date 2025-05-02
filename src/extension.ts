// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

import {
    grabOnYCoord, grabStatically, openCommunication, showCalibrationText
} from './demo-commands';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  const calibrationScheme = "calibration";
  const calibrationUri = vscode.Uri.parse(
    `${calibrationScheme}://calibrationText`
  );

  // This is the text we want to show
  const calibrationText = "The quick brown fox jumps over the lazy dog.";

  // Set up the content provider
  const calibrationProvider: vscode.TextDocumentContentProvider = {
    provideTextDocumentContent(uri: vscode.Uri): string {
      return calibrationText;
    },
  };

  // Register the provider
  const providerRegistration =
    vscode.workspace.registerTextDocumentContentProvider(
      calibrationScheme,
      calibrationProvider
    );
  context.subscriptions.push(providerRegistration);

  // Use the console to output diagnostic information (console.log) and errors (console.error)
  // This line of code will only be executed once when your extension is activated
  console.log('Congratulations, your extension "gp3attention" is now active!');

  context.subscriptions.push(grabStatically());
  context.subscriptions.push(grabOnYCoord());
  context.subscriptions.push(showCalibrationText(calibrationUri));
  context.subscriptions.push(openCommunication());
}

// This method is called when your extension is deactivated
export function deactivate() {}
