import * as net from 'net';
import * as vscode from 'vscode';

export class OpenGazeTracker {
  private client: net.Socket;
  private isConnected: boolean = false;
  private incomingBuffer: string = "";
  private debug: boolean;
  private debugCounter: number = 0;
  private logFile: vscode.OutputChannel;

  constructor(
    private host: string = "127.0.0.1",
    private port: number = 4242,
    debug: boolean = false
  ) {
    this.debug = debug;
    this.logFile = vscode.window.createOutputChannel("OpenGaze Log");

    this.client = new net.Socket();

    this.client.connect(this.port, this.host, () => {
      this.isConnected = true;
      this.debugPrint(`Connected to ${this.host}:${this.port}`);
    });

    this.client.on("data", (data: Buffer) => {
      this.processIncoming(data.toString());
    });

    this.client.on("error", (err: Error) => {
      this.debugPrint(`Socket error: ${err.message}`);
    });

    this.client.on("close", () => {
      this.isConnected = false;
      this.debugPrint("Connection closed");
    });
  }

  private processIncoming(data: string) {
    this.debugPrint(`Received data: ${data}`);
    this.incomingBuffer += data;

    // Example: process complete lines if using line-delimited protocol
    let lines = this.incomingBuffer.split("\n");
    this.incomingBuffer = lines.pop() || ""; // keep any partial line

    for (const line of lines) {
      this.handleLine(line.trim());
    }
  }

  private handleLine(line: string) {
    // You'd parse your XML or TSV here as needed
    this.logFile.appendLine(`Data: ${line}`);
  }

  send(message: string) {
    if (this.isConnected) {
      this.client.write(message + "\n");
      this.debugPrint(`Sent: ${message}`);
    } else {
      this.debugPrint("Cannot send, not connected");
    }
  }

  close() {
    if (this.isConnected) {
      this.client.end();
    }
  }

  private debugPrint(message: string) {
    if (this.debug) {
      const timestamp = new Date().toISOString();
      console.log(`[DEBUG ${timestamp}] ${message}`);
      this.logFile.appendLine(`[DEBUG ${timestamp}] ${message}`);
      this.debugCounter++;
    }
  }
}
