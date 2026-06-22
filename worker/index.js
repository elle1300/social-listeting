const http = require("http");

const port = Number(process.env.PORT || 3001);

const server = http.createServer((request, response) => {
  const body = {
    ok: true,
    service: "social-listeting-worker",
    message: "Hello from the Railway worker",
    path: request.url,
    time: new Date().toISOString()
  };

  response.writeHead(200, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(body, null, 2));
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Worker listening on port ${port}`);
});
