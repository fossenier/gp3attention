import * as net from 'net';
import * as vscode from 'vscode';

const CALIBRATE_DELAY = "CALIBRATE_DELAY";
const CALIBRATE_RESET = "CALIBRATE_RESET";
const CALIBRATE_SHOW = "CALIBRATE_SHOW";
const CALIBRATE_START = "CALIBRATE_START";
const CALIBRATE_TIMEOUT = "CALIBRATE_TIMEOUT";
const ENABLE_SEND_COUNTER = "ENABLE_SEND_COUNTER";
const ENABLE_SEND_CURSOR = "ENABLE_SEND_CURSOR";
const ENABLE_SEND_DATA = "ENABLE_SEND_DATA";
const ENABLE_SEND_POG_BEST = "ENABLE_SEND_POG_BEST";
const ENABLE_SEND_POG_FIX = "ENABLE_SEND_POG_FIX";
const TRACKER_DISPLAY = "TRACKER_DISPLAY";

// Talks to the gp3 camera over TCP/IP, you need to have the Gazepoint Control running.
export class gp3Interface {
  private client: net.Socket;
  private debug: boolean;
  private debugCounter: number = 0;
  private isConnected: boolean = false;
  private incomingBuffer: string = "";
  private logFile: vscode.OutputChannel;
  private unacknowledged: string[] = [];

  constructor(
    private host: string = "127.0.0.1",
    private port: number = 4242,
    debug: boolean = false
  ) {
    this.debug = debug; // Set to true to enable debug messages
    this.logFile = vscode.window.createOutputChannel("gp3Interface Log"); // Log to VS Code output tab

    this.client = new net.Socket();

    // This creates a connection to the server (Gazepoint Control)
    this.client.connect(this.port, this.host, () => {
      this.isConnected = true;
      this.debugPrint(`Connected to ${this.host}:${this.port}`);

      // Enable data sending from the server by default
      this.send(true, ENABLE_SEND_DATA, [["STATE", "1"]], false);
    //     .then(([acknowledged, timedOut]) => {
    //       if (acknowledged) {
    //         this.debugPrint("Data sending enabled successfully.");
    //       } else if (timedOut) {
    //         this.debugPrint("Failed to enable data sending: timed out.");
    //       } else {
    //         this.debugPrint("Failed to enable data sending: not acknowledged.");
    //       }
    //     });

      this.calibrate(); // Start calibration process
    });

    // Establish a listenner for incoming data. Handle the data as it comes in.
    this.client.on("data", (data: Buffer) => {
      this.processIncoming(data.toString());
    });

    // Establish a listener for errors. Log them as they come in.
    this.client.on("error", (err: Error) => {
      this.debugPrint(`Socket error: ${err.message}`);
    });

    // Establish a listener for the end of the connection. Log it as it comes in.
    this.client.on("close", () => {
      this.isConnected = false;
      this.debugPrint("Connection closed");
    });
  }

  private calibrate() {
    this.debugPrint("Calibrating...");
    this.send(true, CALIBRATE_RESET);
    this.send(true, CALIBRATE_SHOW, [["STATE", "1"]]);
    setTimeout(() => {
      this.send(true, CALIBRATE_START, [["STATE", "1"]]); // Start calibration
    }, 1000);
    setTimeout(() => {
      this.send(true, CALIBRATE_SHOW, [["STATE", "0"]]); // Close calibration window
    }, 11000);
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




  /**
   * Sends a message to the server.
   * @param set True if the message is a set command, false if it's a get command.
   * @param id The ID of the command to send.
   * @param parameters A list of parameter key-value pairs to include in the message. [["X", "0.5"], ["Y", "0.1"], ...]
   * @param wait_for_acknowledgement Whether to wait for an acknowledgement from the server.
   * @param max_await The maximum time to wait for an acknowledgement before timing out.
   * @returns Whether the message was acknowledged and whether the command timed out.
   */
  private send(
    set: boolean,
    id: string,
    parameters: string[][] = [],
    wait_for_acknowledgement: boolean = false,
    max_await: number = 9.0
  ): Promise<[boolean, boolean]> {
    // Don't even try to send if we are not connected.
    if (!this.isConnected) {
      this.debugPrint("Cannot send, not connected");
      return Promise.resolve([false, false]);
    }

    // Construct the message
    let message = `<${set ? "SET" : "GET"} ID="${id}"`;
    for (const [key, value] of parameters) {
      message += ` ${key}="${value}"`;
    }
    message += " />\r\n";

    // Send the message
    this.client.write(message);
    this.unacknowledged.push(message); // Track unacknowledged messages
    this.debugPrint(`Sent message: ${message.trim()}`);

    if (!wait_for_acknowledgement) {
      return Promise.resolve([true, false]);
    }

    // Handle acknowledgement logic
    return new Promise<[boolean, boolean]>((resolve) => {
      const startTime = Date.now();
      const checkAcknowledgement = () => {
        const elapsed = (Date.now() - startTime) / 1000;
        if (this.unacknowledged.includes(message)) {
          if (elapsed >= max_await) {
            this.unacknowledged = this.unacknowledged.filter((msg) => msg !== message);
            resolve([false, true]);
          } else {
            setTimeout(checkAcknowledgement, max_await * 1000 / 5); // Check 5 times in the await period
          }
        } else {
          resolve([true, false]); // Acknowledged
        }
      };
      checkAcknowledgement();
    });
  } 
}