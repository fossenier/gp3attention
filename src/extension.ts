import { ChildProcess, spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";

// Interface for tag data
interface TagEntry {
  tag: string;
  timestamp: number;
  visible: boolean;
}

// Tag Manager Class
export class TagManager {
  private outputPath: string;
  private activeDelayedTags: Map<string, NodeJS.Timeout> = new Map();
  private sessionStartTime: number;
  private visibleTags: Set<string> = new Set(); // Track currently visible tags

  constructor(workspaceFolder: string) {
    this.sessionStartTime = Date.now();

    // Create output directory if it doesn't exist
    const outputDir = path.join(workspaceFolder, ".vscode", "recordings");
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Create CSV file with timestamp
    const timestamp = new Date()
      .toISOString()
      .replace(/:/g, "-")
      .replace(/\./g, "_");
    this.outputPath = path.join(outputDir, `tags_${timestamp}.csv`);

    // Write CSV header
    fs.writeFileSync(this.outputPath, "tag,timestamp,visible\n");

    // Initialize with start tag
    this.appendEntry("start", true);
  }

  // Append a tag entry to the CSV
  private appendEntry(tag: string, visible: boolean): void {
    let timestamp: string;

    // For 'start' tag, use just the year
    if (tag === "start") {
      timestamp = new Date().getFullYear().toString();
    } else {
      // For other tags, use ISO format without milliseconds
      timestamp = new Date().toISOString().slice(0, 19);
    }

    // Use capital True/False to match your example
    const visibleStr = visible ? "True" : "False";
    const line = `${tag},${timestamp},${visibleStr}\n`;

    try {
      fs.appendFileSync(this.outputPath, line);

      // Update tracking of visible tags
      if (visible) {
        this.visibleTags.add(tag);
      } else {
        this.visibleTags.delete(tag);
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to save tag: ${error}`);
    }
  }

  // Add a tag with visibility option
  public addTag(tag: string, visible: boolean = true): void {
    this.appendEntry(tag, visible);
  }

  // Add a tag with auto-off delay
  public addTagWithDelay(tag: string, delaySeconds: number): void {
    // Add the tag as visible initially
    this.appendEntry(tag, true);

    // Clear any existing timeout for this tag
    if (this.activeDelayedTags.has(tag)) {
      clearTimeout(this.activeDelayedTags.get(tag)!);
    }

    // Set timeout to turn off visibility
    const timeout = setTimeout(() => {
      // Add an invisible entry for this tag
      this.appendEntry(tag, false);
      this.activeDelayedTags.delete(tag);
    }, delaySeconds * 1000);

    this.activeDelayedTags.set(tag, timeout);
  }

  // Toggle tag visibility (adds a new entry with opposite visibility)
  public toggleTagVisibility(tag: string, visible?: boolean): void {
    // If visible is not specified, toggle based on current state
    const newVisibility =
      visible !== undefined ? visible : !this.visibleTags.has(tag);
    this.appendEntry(tag, newVisibility);
  }

  // Finalize the session
  public finalize(): void {
    // Clear all active delayed tags
    for (const [tag, timeout] of this.activeDelayedTags) {
      clearTimeout(timeout);
      // Add invisible entry if the tag is still visible
      if (this.visibleTags.has(tag)) {
        this.appendEntry(tag, false);
      }
    }
    this.activeDelayedTags.clear();

    // Close all remaining visible tags (like closing parentheses)
    const tagsToClose = new Set(this.visibleTags); // Create a copy
    for (const tag of tagsToClose) {
      if (tag !== "start") {
        // Close all tags except 'start'
        this.appendEntry(tag, false);
      }
    }

    // Finally, add (start, visible=False)
    this.appendEntry("start", false);
  }

  // Get all currently visible tags
  public getVisibleTags(): string[] {
    return Array.from(this.visibleTags);
  }

  // Get file path
  public getFilePath(): string {
    return this.outputPath;
  }

  // Read all entries from CSV (useful for debugging or display)
  public getAllEntries(): TagEntry[] {
    try {
      const content = fs.readFileSync(this.outputPath, "utf-8");
      const lines = content.split("\n").slice(1); // Skip header
      return lines
        .filter((line) => line.trim())
        .map((line) => {
          const [tag, timestamp, visible] = line.split(",");
          return {
            tag,
            timestamp: parseInt(timestamp),
            visible: visible === "true",
          };
        });
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to read tags: ${error}`);
      return [];
    }
  }
}

// Recording Manager
class RecordingManager {
  private ffmpegProcess: ChildProcess | null = null;
  private outputPath: string | null = null;

  public startRecording(workspaceFolder: string): void {
    if (this.ffmpegProcess) {
      vscode.window.showWarningMessage("Recording is already in progress");
      return;
    }

    // Generate timestamp for filename
    const timestamp = new Date()
      .toISOString()
      .replace(/:/g, "-")
      .replace(/\./g, "_")
      .slice(0, -5); // Remove last 5 chars (milliseconds and Z)

    // Create output directory
    const outputDir = path.join(workspaceFolder, ".vscode", "recordings");
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    this.outputPath = path.join(outputDir, `face_${timestamp}.mov`);

    // FFmpeg command arguments
    const args = [
      "-f",
      "avfoundation",
      "-framerate",
      "30",
      "-i",
      "0",
      "-vcodec",
      "h264",
      "-pix_fmt",
      "yuv420p",
      this.outputPath,
    ];

    // Start ffmpeg process
    this.ffmpegProcess = spawn("ffmpeg", args);

    this.ffmpegProcess.on("error", (error) => {
      vscode.window.showErrorMessage(`FFmpeg error: ${error.message}`);
      this.cleanup();
    });

    this.ffmpegProcess.stderr?.on("data", (data) => {
      // FFmpeg outputs to stderr, you can log this if needed
      console.log(`FFmpeg: ${data}`);
    });

    this.ffmpegProcess.on("close", (code) => {
      if (code !== 0 && code !== 255) {
        // 255 is the code when we terminate with SIGTERM
        vscode.window.showErrorMessage(`FFmpeg exited with code ${code}`);
      }
      this.cleanup();
    });

    vscode.window.showInformationMessage(
      `Recording started: ${path.basename(this.outputPath)}`
    );
  }

  public stopRecording(): void {
    if (!this.ffmpegProcess) {
      vscode.window.showWarningMessage("No recording in progress");
      return;
    }

    // Send 'q' to ffmpeg stdin to gracefully stop recording
    this.ffmpegProcess.stdin?.write("q");
    this.ffmpegProcess.stdin?.end();

    // If that doesn't work, use SIGTERM after a delay
    setTimeout(() => {
      if (this.ffmpegProcess) {
        this.ffmpegProcess.kill("SIGTERM");
      }
    }, 1000);

    vscode.window.showInformationMessage("Recording stopped");
  }

  private cleanup(): void {
    this.ffmpegProcess = null;
    this.outputPath = null;
  }

  public isRecording(): boolean {
    return this.ffmpegProcess !== null;
  }
}

// Global instances
let recordingManager: RecordingManager | null = null;
let tagManager: TagManager | null = null;

// Command: Start FFmpeg Recording
export function startRecording() {
  return vscode.commands.registerCommand("gp3attention.startRecording", () => {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceFolder) {
      vscode.window.showErrorMessage("No workspace folder open");
      return;
    }

    if (!recordingManager) {
      recordingManager = new RecordingManager();
    }

    recordingManager.startRecording(workspaceFolder);
  });
}

// Command: Stop FFmpeg Recording
export function stopRecording() {
  return vscode.commands.registerCommand("gp3attention.stopRecording", () => {
    if (!recordingManager) {
      vscode.window.showWarningMessage("No recording manager initialized");
      return;
    }

    recordingManager.stopRecording();
  });
}

// Command: Initialize Tag Manager
export function initializeTagManager() {
  return vscode.commands.registerCommand(
    "gp3attention.initializeTagManager",
    () => {
      const workspaceFolder =
        vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspaceFolder) {
        vscode.window.showErrorMessage("No workspace folder open");
        return;
      }

      if (tagManager) {
        vscode.window.showWarningMessage("Tag manager already initialized");
        return;
      }

      tagManager = new TagManager(workspaceFolder);
      vscode.window.showInformationMessage(
        `Tag manager initialized: ${tagManager.getFilePath()}`
      );
    }
  );
}

// Command: Add Tag
export function addTag() {
  return vscode.commands.registerCommand("gp3attention.addTag", async () => {
    if (!tagManager) {
      vscode.window.showErrorMessage("Tag manager not initialized");
      return;
    }

    const tag = await vscode.window.showInputBox({
      prompt: "Enter tag name",
      placeHolder: "e.g., focus, break, important",
    });

    if (!tag) {
      return;
    }

    const visible = await vscode.window.showQuickPick(["Yes", "No"], {
      placeHolder: "Should the tag be visible?",
    });

    if (visible === undefined) {
      return;
    }

    tagManager.addTag(tag, visible === "Yes");
    vscode.window.showInformationMessage(
      `Tag '${tag}' added (visible: ${visible === "Yes"})`
    );
  });
}

// Command: Add Tag with Delay
export function addTagWithDelay() {
  return vscode.commands.registerCommand(
    "gp3attention.addTagWithDelay",
    async () => {
      if (!tagManager) {
        vscode.window.showErrorMessage("Tag manager not initialized");
        return;
      }

      const tag = await vscode.window.showInputBox({
        prompt: "Enter tag name",
        placeHolder: "e.g., focus, break, important",
      });

      if (!tag) {
        return;
      }

      const delayStr = await vscode.window.showInputBox({
        prompt: "Enter delay in seconds",
        placeHolder: "30",
        validateInput: (value) => {
          const num = parseInt(value);
          if (isNaN(num) || num <= 0) {
            return "Please enter a positive number";
          }
          return null;
        },
      });

      if (!delayStr) {
        return;
      }

      const delay = parseInt(delayStr);
      tagManager.addTagWithDelay(tag, delay);
      vscode.window.showInformationMessage(
        `Tag '${tag}' added with ${delay}s delay`
      );
    }
  );
}

// Command: Toggle Tag Visibility
export function toggleTagVisibility() {
  return vscode.commands.registerCommand(
    "gp3attention.toggleTagVisibility",
    async () => {
      if (!tagManager) {
        vscode.window.showErrorMessage("Tag manager not initialized");
        return;
      }

      // Show currently visible tags with a marker
      const entries = tagManager.getAllEntries();
      const uniqueTags = [...new Set(entries.map((e) => e.tag))];
      const visibleTags = tagManager.getVisibleTags();

      const tagOptions = uniqueTags.map((tag) => {
        const isVisible = visibleTags.includes(tag);
        return {
          label: tag,
          description: isVisible ? "(currently visible)" : "(currently hidden)",
        };
      });

      const selected = await vscode.window.showQuickPick(tagOptions, {
        placeHolder: "Select tag to toggle",
      });

      if (!selected) {
        return;
      }

      tagManager.toggleTagVisibility(selected.label);
      const newVisibility = !visibleTags.includes(selected.label);
      vscode.window.showInformationMessage(
        `Tag '${selected.label}' is now ${newVisibility ? "visible" : "hidden"}`
      );
    }
  );
}

// Command: Show Visible Tags
export function showVisibleTags() {
  return vscode.commands.registerCommand("gp3attention.showVisibleTags", () => {
    if (!tagManager) {
      vscode.window.showErrorMessage("Tag manager not initialized");
      return;
    }

    const visibleTags = tagManager.getVisibleTags();
    if (visibleTags.length === 0) {
      vscode.window.showInformationMessage("No tags are currently visible");
    } else {
      vscode.window.showInformationMessage(
        `Visible tags: ${visibleTags.join(", ")}`
      );
    }
  });
}

// Command: Finalize Session
export function finalizeSession() {
  return vscode.commands.registerCommand("gp3attention.finalizeSession", () => {
    if (tagManager) {
      tagManager.finalize();
      vscode.window.showInformationMessage(
        "Session finalized - all visible tags closed"
      );
      tagManager = null;
    }

    if (recordingManager && recordingManager.isRecording()) {
      recordingManager.stopRecording();
    }
  });
}

// Extension activation
export function activate(context: vscode.ExtensionContext) {
  // Register all commands
  context.subscriptions.push(
    startRecording(),
    stopRecording(),
    initializeTagManager(),
    addTag(),
    addTagWithDelay(),
    toggleTagVisibility(),
    showVisibleTags(),
    finalizeSession()
  );

  // Cleanup on deactivation
  context.subscriptions.push({
    dispose: () => {
      if (tagManager) {
        tagManager.finalize();
      }
      if (recordingManager && recordingManager.isRecording()) {
        recordingManager.stopRecording();
      }
    },
  });
}

// Extension deactivation
export function deactivate() {
  if (tagManager) {
    tagManager.finalize();
  }
  if (recordingManager && recordingManager.isRecording()) {
    recordingManager.stopRecording();
  }
}
