declare const process: {
  exitCode?: number;
  env: Record<string, string | undefined>;
};

declare const require:
  | {
      main?: unknown;
    }
  | undefined;

declare const module: unknown;

declare module "node:http" {
  export interface IncomingMessage {
    url?: string;
  }

  export interface ServerResponse {
    writeHead(statusCode: number, headers: Record<string, string>): void;
    end(body?: string): void;
  }

  export function createServer(
    handler: (request: IncomingMessage, response: ServerResponse) => void
  ): {
    listen(port: number, host: string, callback: () => void): void;
  };
}
