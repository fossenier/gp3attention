import * as net from "net";
import * as vscode from "vscode";
import { parseStringPromise } from "xml2js";

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

const SET = true;
const GET = false;

/**
 * The `gp3Interface` class provides an interface for communicating with a Gazepoint Control server
 * over a TCP socket. It supports sending commands, receiving responses, and handling calibration
 * processes for eye-tracking data.
 *
 * @remarks
 * This class is designed to work with the Gazepoint Control API, enabling features such as
 * calibration, data streaming, and command acknowledgements. It uses XML-based communication
 * and processes incoming data asynchronously.
 *
 * @param host - The hostname or IP address of the Gazepoint Control server. Defaults to "127.0.0.1".
 * @param port - The port number of the Gazepoint Control server. Defaults to 4242.
 * @param debug - Whether to enable debug logging. Defaults to `false`.
 */
export class gp3Interface {
  private client: net.Socket; // TCP socket for communication
  private debug: boolean; // Whether to log debug messages
  private debugCounter: number = 0; // Enumerates messages
  private isConnected: boolean = false;
  private logFile: vscode.OutputChannel; // Display logs in the VS Code output tab
  private unacknowledged: string[] = []; // For handling acknowledgements

  constructor(
    private host: string = "127.0.0.1",
    private port: number = 4242,
    debug: boolean = false
  ) {
    this.debug = debug;
    this.logFile = vscode.window.createOutputChannel("gp3Interface Log");

    this.client = new net.Socket();

    // This creates a connection to the server (Gazepoint Control)
    this.client.connect(this.port, this.host, () => {
      this.isConnected = true;
      this.debugPrint(`Connected to ${this.host}:${this.port}`);
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

  /**
   * Initiates the process by enabling data transmission from the server
   * and starting the calibration process.
   *
   * - Enables the sending of general data from the server.
   * - Enables the sending of counter data.
   * - Enables the sending of the best point of gaze (POG) data.
   * - Enables the sending of fixation point of gaze (POG) data.
   * - Starts the calibration process to ensure accurate data collection.
   */
  public async begin(): Promise<boolean> {
    // Wait until the connection is established
    while (!this.isConnected) {
      await new Promise((resolve) => setTimeout(resolve, 100)); // Check every 100ms
    }

    // Enable data sending from the server by default
    this.send(SET, ENABLE_SEND_DATA, [["STATE", "1"]]);
    this.send(SET, ENABLE_SEND_COUNTER, [["STATE", "1"]]);
    this.send(SET, ENABLE_SEND_POG_BEST, [["STATE", "1"]]);
    this.send(SET, ENABLE_SEND_POG_FIX, [["STATE", "1"]]);
    return this.calibrate();
  }

  /**
   * Initiates the calibration process for the system.
   *
   * This method performs a series of asynchronous operations to reset,
   * display, and start the calibration process. It uses a sequence of
   * commands sent to the system and resolves a promise once the calibration
   * process is complete.
   *
   * @returns {Promise<boolean>} A promise that resolves to `true` once the
   * calibration process is successfully completed.
   */
  private calibrate(): Promise<boolean> {
    this.debugPrint("Calibrating...");
    this.send(SET, CALIBRATE_RESET);
    this.send(SET, CALIBRATE_SHOW, [["STATE", "1"]]);

    return new Promise((resolve) => {
      setTimeout(() => {
        this.send(SET, CALIBRATE_START, [["STATE", "1"]]);
        setTimeout(() => {
          this.send(SET, CALIBRATE_SHOW, [["STATE", "0"]]);
          resolve(true);
        }, 10000);
      }, 1000);
    });
  }

  public calibrateUpperLeft(): Promise<boolean> {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve(true);
      }, 7000);
    });
  }

  public calibrateLowerRight(): Promise<boolean> {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve(true);
      }, 7000);
    });
  }

  /**
   * Closes the connection to the client if it is currently connected.
   * Ensures that the `end` method is called on the client to terminate the connection.
   */
  close() {
    if (this.isConnected) {
      this.client.end();
    }
  }

  /**
   * Logs a debug message to the console and a log file if debugging is enabled.
   * Each message is prefixed with a timestamp and increments the debug counter.
   *
   * @param message - The debug message to be logged.
   */
  private debugPrint(message: string) {
    if (this.debug) {
      const timestamp = new Date().toISOString();
      console.log(`[DEBUG ${timestamp}] ${message}`);
      this.logFile.appendLine(`[DEBUG ${timestamp}] ${message}`);
      this.debugCounter++;
    }
  }

  /**
   * Handles the processing of an XML string by parsing it into a JavaScript object
   * and performing actions based on the parsed data.
   *
   * @param xml - The XML string to be processed.
   *
   * @remarks
   * This method processes two main types of XML responses:
   * - `ACK`: Acknowledgment messages with various IDs that trigger specific actions.
   * - `REC`: Recording data containing various fields, processed every 180th frame.
   *
   * The method also logs unhandled acknowledgment IDs and unknown response types.
   *
   * @throws Will log an error if the XML parsing fails.
   *
   * @example
   * ```typescript
   * const xmlString = `<ACK ID="CALIBRATE_DELAY" VALUE="100"/>`;
   * await handleXML(xmlString);
   * // Logs: "Delay value: 100"
   * ```
   */
  private async handleXML(xml: string) {
    // Parse the XML string into a JavaScript object
    try {
      const result = await parseStringPromise(xml);

      if (result.ACK) {
        const ack = result.ACK.$; // Attributes are under '$'
        const id = ack.ID;

        // Acknowledge any messages matching this acknowledged ID
        this.unacknowledged = this.unacknowledged.filter(
          (msg) => !msg.includes(id)
        );

        switch (id) {
          case CALIBRATE_DELAY:
            this.debugPrint(`Delay value: ${ack.VALUE}`);
            break;
          case CALIBRATE_RESET:
            this.debugPrint(`Reset PTS: ${ack.PTS}`);
            break;
          case CALIBRATE_SHOW:
            this.debugPrint(`Show state: ${ack.STATE}`);
            break;
          case CALIBRATE_START:
            this.debugPrint(`Start value: ${ack.VALUE}`);
            break;
          case CALIBRATE_TIMEOUT:
            this.debugPrint(`Timeout value: ${ack.VALUE}`);
            break;
          case ENABLE_SEND_COUNTER:
            this.debugPrint(`Enable send counter: ${ack.STATE}`);
            break;
          case ENABLE_SEND_CURSOR:
            this.debugPrint(`Enable send cursor: ${ack.STATE}`);
            break;
          case ENABLE_SEND_DATA:
            this.debugPrint(`Enable send data: ${ack.STATE}`);
            break;
          case ENABLE_SEND_POG_BEST:
            this.debugPrint(`Enable send POG best: ${ack.STATE}`);
            break;
          case ENABLE_SEND_POG_FIX:
            this.debugPrint(`Enable send POG fix: ${ack.STATE}`);
            break;
          case TRACKER_DISPLAY:
            this.debugPrint(`Tracker display: ${ack.STATE}`);
            break;
          default:
            this.debugPrint(`Unhandled ACK ID: ${id}, ${JSON.stringify(ack)}`);
        }
      } else if (result.CAL) {
        // We don't need to handle calibration data right now
      } else if (result.REC) {
        const rec = result.REC.$;

        // Example: read fields, using optional chaining or fallback defaults
        const cnt = rec.CNT ?? null;
        const fpogx = rec.FPOGX ?? null;
        const fpogy = rec.FPOGY ?? null;
        const fpogs = rec.FPOGS ?? null;
        const fpogd = rec.FPOGD ?? null;
        const fpogid = rec.FPOGID ?? null;
        const fpogv = rec.FPOGV ?? null;
        const bpogx = rec.BPOGX ?? null;
        const bpogy = rec.BPOGY ?? null;
        const bpogv = rec.BPOGV ?? null;
        const cx = rec.CX ?? null;
        const cy = rec.CY ?? null;
        const cs = rec.CS ?? null;

        if (cnt % 180 !== 0) {
          // Only process every 180th frame
          return;
        }
        this.debugPrint(
          JSON.stringify({
            cnt,
            fpogx,
            fpogy,
            fpogs,
            fpogd,
            fpogid,
            fpogv,
            bpogx,
            bpogy,
            bpogv,
            cx,
            cy,
            cs,
          })
        );
      } else {
        console.warn("Unknown response type:", result);
      }
    } catch (error) {
      console.error("Error parsing XML:", error);
    }
  }

  /**
   * Process camera data by taking incoming lines, splitting them, and parsing the XML.
   *
   * @param data - The incoming string data to be processed.
   *               Each line of the data is expected to be separated by a newline character (`\n`).
   *
   * @returns A promise that resolves when all lines have been processed.
   */
  private async processIncoming(data: string) {
    // Split the incoming data into lines
    const lines = data.split("\n");
    for (let i = 0; i < lines.length - 1; i++) {
      const line = lines[i].trim(); // Cut off the '\r' and '\n'
      if (line !== "<REC />") {
        // Ignore empty record lines
        await this.handleXML(line); // Handle each line as needed
      }
    }
  }

  /**
   * Sends a message to the server.
   * @param set True if the message is a set command, false if it's a get command.
   * @param id The ID of the command to send.
   * @param parameters A list of parameter key-value pairs to include in the message. [["X", "0.5"], ["Y", "0.1"], ...]
   * @param wait_for_acknowledgement Whether to wait for an acknowledgement from the server.
   * @param max_await The maximum time to wait for an acknowledgement before timing out.
   * @returns A promise that resolves to a tuple:
   *          - The first element is a boolean indicating whether the message was acknowledged.
   *          - The second element is a boolean indicating whether the command timed out.
   */
  private async send(
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
    this.debugPrint(`Sent message: ${message.trim()}`);

    if (!wait_for_acknowledgement) {
      return Promise.resolve([true, false]);
    }

    // Handle acknowledgement logic
    this.unacknowledged.push(message); // Track unacknowledged messages
    return new Promise<[boolean, boolean]>((resolve) => {
      const startTime = Date.now();
      const checkAcknowledgement = () => {
        const elapsed = (Date.now() - startTime) / 1000;
        if (this.unacknowledged.includes(message)) {
          if (elapsed >= max_await) {
            this.unacknowledged = this.unacknowledged.filter(
              (msg) => msg !== message
            );
            resolve([false, true]);
          } else {
            setTimeout(checkAcknowledgement, (max_await * 1000) / 5); // Check 5 times in the await period
          }
        } else {
          resolve([true, false]); // Acknowledged
        }
      };
      checkAcknowledgement();
    });
  }
}
