import * as vscode from "vscode";
import { gp3Interface } from "./gp3Interface";
import { FRANKENSTEIN_TEXT } from "./frankenstein";

export function launchTrackingSession() {
  return vscode.commands.registerCommand(
    "gp3attention.launchTrackingSession",
    async () => {
      // Validate that the editor is open and active
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showInformationMessage("No active editor!");
        return;
      }

      openCalibrationText().then(() => {
        vscode.window.showInformationMessage("Calibration done!");
      });
    }
  );
}

// async function openCalibrationText() {
//   const editor = vscode.window.activeTextEditor;
//   if (!editor) {
//     vscode.window.showInformationMessage("No active editor!");
//     return;
//   }

//   // Ask before opening the text
//   const selection = await vscode.window.showInformationMessage(
//     "Ready to open calibration text.",
//     "Open",
//     "Cancel"
//   );

//   if (selection === "Open") {
//     // Load the sample text
//     const document = await vscode.workspace.openTextDocument({
//       content: FRANKENSTEIN_TEXT,
//       language: "plaintext",
//     });
//     await vscode.window.showTextDocument(document, vscode.ViewColumn.Active);

//     // Wait for the calibration prompt
//     await new Promise((resolve) => setTimeout(resolve, 2000));
//     await promptGp3Calibration();
//   } else {
//     vscode.window.showInformationMessage("Calibration cancelled.");
//   }
// }

async function openCalibrationText() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showInformationMessage("No active editor!");
    return;
  }

  // Save the current document URI
  const previousDocUri = editor.document.uri;

  // Ask before opening the calibration text
  const selection = await vscode.window.showInformationMessage(
    "Ready to open calibration text.",
    "Open",
    "Cancel"
  );

  if (selection !== "Open") {
    vscode.window.showInformationMessage("Calibration cancelled.");
    return;
  }

  // Close the current editor by opening a blank untitled doc in its place
  await vscode.commands.executeCommand("workbench.action.closeActiveEditor");

  // Create a virtual, non-editable document
  const virtualUri = vscode.Uri.parse("calibration-text:Calibration");

  const provider: vscode.TextDocumentContentProvider = {
    provideTextDocumentContent: () => FRANKENSTEIN_TEXT,
  };

  const registration = vscode.workspace.registerTextDocumentContentProvider(
    "calibration-text",
    provider
  );

  // Open the calibration text in the active column (view-only)
  const document = await vscode.workspace.openTextDocument(virtualUri);
  await vscode.window.showTextDocument(
    document,
    vscode.ViewColumn.Active,
    false
  );

  // Wait for the calibration prompt
  await new Promise((resolve) => setTimeout(resolve, 2000));
  await promptGp3Calibration();

  // Close the calibration text
  await vscode.commands.executeCommand("workbench.action.closeActiveEditor");

  // Re-open the previous document
  const reopenedDoc = await vscode.workspace.openTextDocument(previousDocUri);
  await vscode.window.showTextDocument(reopenedDoc, vscode.ViewColumn.Active);

  // Cleanup the provider
  registration.dispose();
}

async function promptGp3Calibration() {
  // The user must have calibration text open
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showInformationMessage("No active editor!");
    return;
  }

  // Ask the user to begin calibration of the gp3 camera
  const selection = await vscode.window.showInformationMessage(
    "Ready to calibrate the eye tracker.",
    "Start Calibration",
    "Cancel"
  );

  if (selection === "Start Calibration") {
    // Begin the built-in gp3 calibration process
    const tracker = new gp3Interface("127.0.0.1", 4242, true);
    await tracker.begin();
    vscode.window.showInformationMessage(
      "Eye tracker calibrated successfully."
    );

    // Wait for 2 seconds before starting the next step
    await new Promise((resolve) => setTimeout(resolve, 2000));
    await promptWindowCalibration(tracker);
  } else {
    vscode.window.showInformationMessage("Calibration cancelled.");
  }
}

async function promptWindowCalibration(tracker: gp3Interface) {
  // The user must have calibration text open
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showInformationMessage("No active editor!");
    return;
  }

  // Ask the user to begin calibration of the window
  const selection = await vscode.window.showInformationMessage(
    "Step 1: Stare at the very first letter you can see for 5 seconds.",
    "Start 5 seconds",
    "Cancel"
  );

  if (selection === "Start 5 seconds") {
    // Monitor the eye movement
    await tracker.calibrateUpperLeft();
    vscode.window.showInformationMessage("Upper left calibrated.");

    // Wait for 2 seconds before starting the next step
    await new Promise((resolve) => setTimeout(resolve, 2000));
    await promptWindowCalibration2(tracker);
  } else {
    vscode.window.showInformationMessage("Calibration cancelled.");
  }
}

async function promptWindowCalibration2(tracker: gp3Interface) {
  // The user must have calibration text open
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showInformationMessage("No active editor!");
    return;
  }

  // Ask the user to begin calibration of the window
  const selection = await vscode.window.showInformationMessage(
    "Step 2: Stare at the very last letter you can see for 5 seconds.",
    "Start 5 seconds",
    "Cancel"
  );

  if (selection === "Start 5 seconds") {
    // Monitor the eye movement
    await tracker.calibrateLowerRight();
    vscode.window.showInformationMessage("Lower right calibrated.");
  } else {
    vscode.window.showInformationMessage("Calibration cancelled.");
  }
}
